using Azure.Storage.Blobs;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

var b = WebApplication.CreateBuilder(args);
b.WebHost.UseUrls("http://localhost:5080");
b.Services.AddDbContext<Db>(o => o.UseSqlServer(b.Configuration.GetConnectionString("Default")));
b.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));
b.Services.AddSingleton(new BlobContainerClient(b.Configuration["Blob:ConnectionString"], "inspection-photos"));
var app = b.Build();
app.UseCors();

using (var s = app.Services.CreateScope())
{
    var db = s.ServiceProvider.GetRequiredService<Db>();
    db.Database.EnsureCreated();
    if (!db.Templates.Any())
    {
        var seed = JsonDocument.Parse(File.ReadAllText("Seed/seed.json")).RootElement;
        foreach (var t in seed.GetProperty("templates").EnumerateArray())
            db.Templates.Add(new Template { Key = t.GetProperty("key").GetString()!, Name = t.GetProperty("name").GetString()!,
                FrequencyHours = t.GetProperty("frequencyHours").GetInt32(), ItemsJson = t.GetProperty("items").GetRawText() });
        foreach (var a in seed.GetProperty("assets").EnumerateArray())
            db.Assets.Add(new Asset { Code = a.GetProperty("code").GetString()!, Name = a.GetProperty("name").GetString()!,
                Location = a.GetProperty("location").GetString()!, TemplateKey = a.GetProperty("template").GetString()! });
        db.SaveChanges();
        // SAMPLE history so the demo is not empty (inspector sample.data@check.com). Delete these rows before real use.
        foreach (var (a, ix) in db.Assets.ToList().Select((x, i) => (x, i)))
        {
            if (ix % 4 == 3) continue;   // stays "not yet inspected"
            var tp = db.Templates.Find(a.TemplateKey)!; var cnt = JsonDocument.Parse(tp.ItemsJson).RootElement.GetArrayLength();
            for (var k = 2; k >= 1; k--)
            {
                var bad = ix == 5 && k == 1;
                db.Inspections.Add(new Inspection { AssetId = a.Id, Inspector = "sample.data@check.com", Method = "QR",
                    At = DateTime.UtcNow.AddHours(-tp.FrequencyHours * (k - 0.5 + (ix % 4 == 1 ? 1.5 : 0))), Status = bad ? "Fail" : "Pass",
                    ResponsesJson = JsonSerializer.Serialize(Enumerable.Range(0, cnt).ToDictionary(i => i.ToString(), i => bad && i == 0 ? "Fail" : "Pass")) });
            }
        }
        db.SaveChanges();
    }
}

var tz = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata");
// prototype role rule: @check.com = inspector (can edit). Production: role comes from company SSO claims.
bool Inspector(HttpRequest r) => r.Headers["X-User"].ToString().EndsWith("@check.com", StringComparison.OrdinalIgnoreCase);
// check periods follow the paper sheets: 2h slot / calendar day / week band (1-6,7-13,14-20,21-end) / calendar month
DateTime PStart(int h, DateTime t) => h <= 2 ? t.Date.AddHours(t.Hour % 2 == 1 ? t.Hour : t.Hour - 1) : h <= 24 ? t.Date
    : h <= 168 ? new DateTime(t.Year, t.Month, t.Day >= 21 ? 21 : t.Day >= 14 ? 14 : t.Day >= 7 ? 7 : 1) : new DateTime(t.Year, t.Month, 1);
DateTime PEnd(int h, DateTime s) => h <= 2 ? s.AddHours(2) : h <= 24 ? s.AddDays(1)
    : h <= 168 ? (s.Day == 21 ? new DateTime(s.Year, s.Month, 1).AddMonths(1) : s.AddDays(s.Day == 1 ? 6 : 7)) : s.AddMonths(1);

// ok = checked this period | due = period running, not yet checked | overdue = a period ended unchecked | notyet = new equipment, first period still running
app.MapGet("/api/assets", async (Db db) =>
{
    var ts = await db.Templates.ToDictionaryAsync(t => t.Key);
    var last = await db.Inspections.Where(i => i.At == db.Inspections.Where(x => x.AssetId == i.AssetId).Max(x => x.At)).ToListAsync();
    var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
    return (await db.Assets.ToListAsync()).Select(a =>
    {
        var t = ts[a.TemplateKey]; var h = t.FrequencyHours; var s = PStart(h, now);
        var l = last.FirstOrDefault(i => i.AssetId == a.Id);
        var la = l == null ? (DateTime?)null : TimeZoneInfo.ConvertTimeFromUtc(l.At, tz);
        var created = TimeZoneInfo.ConvertTimeFromUtc(a.CreatedAt, tz);
        var state = l == null ? (created < s ? "overdue" : "notyet") : l.Status == "Fail" ? "failed"
            : la >= s ? "ok" : la >= PStart(h, s.AddSeconds(-1)) ? "due" : "overdue";
        var due = TimeZoneInfo.ConvertTimeToUtc(state == "ok" ? PEnd(h, PEnd(h, s)) : PEnd(h, s), tz);
        return new { a.Id, a.Code, a.Name, a.Location, a.TemplateKey, Template = t.Name, FrequencyHours = h, LastAt = l?.At, LastBy = l?.Inspector, State = state, Due = due };
    });
});

app.MapGet("/api/templates/{key}", async (string key, Db db) =>
    await db.Templates.FindAsync(key) is { } t ? Results.Ok(new { t.Name, items = JsonSerializer.Deserialize<string[]>(t.ItemsJson) }) : Results.NotFound());

app.MapPost("/api/inspections", async (NewInspection n, Db db, HttpRequest r) =>
{
    if (!Inspector(r)) return Results.Json(new { error = "You do not have access to submit inspections." }, statusCode: 403);
    var i = new Inspection { AssetId = n.AssetId, Inspector = r.Headers["X-User"].ToString().ToLower(), At = DateTime.UtcNow, Remarks = n.Remarks ?? "",
        Method = n.Method == "Manual" ? "Manual" : "QR", ResponsesJson = JsonSerializer.Serialize(n.Responses), PhotosJson = JsonSerializer.Serialize(n.Photos),
        Status = n.Responses.Values.Contains("Fail") ? "Fail" : "Pass" };
    db.Inspections.Add(i); await db.SaveChangesAsync(); return Results.Ok(new { i.Id });
});

app.MapGet("/api/assets/{id:int}/inspections", async (int id, Db db) =>
    await db.Inspections.Where(i => i.AssetId == id).OrderByDescending(i => i.At).Take(50).ToListAsync());

// photos go to a private Azure Blob container; SQL only stores the blob name
app.MapPost("/api/photos", async (IFormFile file, BlobContainerClient c, HttpRequest r) =>
{
    if (!Inspector(r)) return Results.Json(new { error = "Not allowed." }, statusCode: 403);
    await c.CreateIfNotExistsAsync();
    var name = $"{Guid.NewGuid()}.jpg";
    await c.GetBlobClient(name).UploadAsync(file.OpenReadStream());
    return Results.Ok(new { name });
}).DisableAntiforgery();
app.MapGet("/api/photos/{n}", async (string n, BlobContainerClient c) => Results.Stream(await c.GetBlobClient(n).OpenReadAsync(), "image/jpeg"));

app.MapGet("/api/inspections/recent", async (Db db) => await db.Inspections.OrderByDescending(i => i.At).Take(8)
    .Join(db.Assets, i => i.AssetId, a => a.Id, (i, a) => new { a.Name, i.Inspector, i.Status, i.At }).ToListAsync());

app.Run();

record NewInspection(int AssetId, string? Remarks, Dictionary<string, string> Responses, List<string> Photos, string? Method);
class Template { public string Key { get; set; } = ""; public string Name { get; set; } = ""; public int FrequencyHours { get; set; } public string ItemsJson { get; set; } = "[]"; }
class Asset { public int Id { get; set; } public string Code { get; set; } = ""; public string Name { get; set; } = ""; public string Location { get; set; } = ""; public string TemplateKey { get; set; } = ""; public DateTime CreatedAt { get; set; } = DateTime.UtcNow; }
class Inspection { public int Id { get; set; } public int AssetId { get; set; } public string Inspector { get; set; } = ""; public DateTime At { get; set; } public string Method { get; set; } = "QR";
    public string Status { get; set; } = ""; public string Remarks { get; set; } = ""; public string ResponsesJson { get; set; } = "{}"; public string PhotosJson { get; set; } = "[]"; }
class Db(DbContextOptions<Db> o) : DbContext(o)
{
    public DbSet<Template> Templates => Set<Template>(); public DbSet<Asset> Assets => Set<Asset>(); public DbSet<Inspection> Inspections => Set<Inspection>();
    protected override void OnModelCreating(ModelBuilder m) => m.Entity<Template>().HasKey(t => t.Key);
}
