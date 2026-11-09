using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Endpoints;
using SchoolAdmission.Api.Services;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "Configure the database with ConnectionStrings__DefaultConnection.");
}

var holdDurationSetting = builder.Configuration["HOLD_DURATION_SECONDS"];
var holdDurationSeconds = 600;
if (holdDurationSetting is not null &&
    (!int.TryParse(holdDurationSetting, out holdDurationSeconds) || holdDurationSeconds < 1))
{
    throw new InvalidOperationException("HOLD_DURATION_SECONDS must be a positive integer.");
}

builder.Services.AddDbContext<SchoolDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddSingleton(new HoldOptions(TimeSpan.FromSeconds(holdDurationSeconds)));
builder.Services.AddHostedService<HoldExpirationService>();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    var database = scope.ServiceProvider.GetRequiredService<SchoolDbContext>();
    await database.Database.EnsureCreatedAsync();
    await database.Database.ExecuteSqlRawAsync(
        """ALTER TABLE "Classes" ADD COLUMN IF NOT EXISTS "IsActive" boolean NOT NULL DEFAULT TRUE;""");
}

app.UseCors();
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapSchoolAdmissionEndpoints();

app.Run();
