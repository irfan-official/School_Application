using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Models;
using SchoolAdmission.Api.Services;

namespace SchoolAdmission.Api.Endpoints;

public static partial class SchoolAdmissionEndpoints
{
    private const string ActiveHoldConstraint = "UX_Holds_ActiveStudentClass";

    [GeneratedRegex(@"^\d{17}$", RegexOptions.CultureInvariant)]
    private static partial Regex StudentIdPattern();

    public static IEndpointRouteBuilder MapSchoolAdmissionEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/classes", CreateClassAsync);
        app.MapGet("/classes", GetClassesAsync);
        app.MapGet("/classes/{classId}", GetClassAsync);
        app.MapPost("/classes/{classId}/holds", CreateHoldAsync);
        app.MapGet("/holds/{holdId}", GetHoldAsync);
        app.MapPost("/holds/{holdId}/confirm", ConfirmHoldAsync);
        app.MapDelete("/holds/{holdId}", CancelHoldAsync);
        app.MapGet("/me/holds", GetMyHoldsAsync);

        return app;
    }

    private static async Task<IResult> CreateClassAsync(
        CreateClassRequest? request,
        SchoolDbContext database,
        CancellationToken cancellationToken)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("ক্লাসের নাম দিতে হবে।");
        }

        var name = request.Name.Trim();
        if (name.Length > 120 || request.TotalSeats is < 1 or > 500)
        {
            return BadRequest("ক্লাসের নাম সর্বোচ্চ ১২০ অক্ষর এবং আসনসংখ্যা ১–৫০০ হতে হবে।");
        }

        var schoolClass = new SchoolClass
        {
            Id = $"c_{Guid.NewGuid():N}",
            Name = name,
            TotalSeats = request.TotalSeats,
        };

        database.Classes.Add(schoolClass);
        await database.SaveChangesAsync(cancellationToken);

        return Results.Created($"/classes/{schoolClass.Id}", new CreatedClassResponse(
            schoolClass.Id,
            schoolClass.Name,
            schoolClass.TotalSeats));
    }

    private static async Task<IResult> GetClassesAsync(
        SchoolDbContext database,
        CancellationToken cancellationToken)
    {
        await ExpireOverdueHoldsAsync(database, DateTimeOffset.UtcNow, cancellationToken);

        var classes = await database.Classes
            .AsNoTracking()
            .OrderBy(schoolClass => schoolClass.Name)
            .ToListAsync(cancellationToken);
        var seatCounts = await database.Holds
            .AsNoTracking()
            .Where(hold => hold.Status == HoldStatuses.Held || hold.Status == HoldStatuses.Confirmed)
            .GroupBy(hold => new { hold.ClassId, hold.Status })
            .Select(group => new { group.Key.ClassId, group.Key.Status, Count = group.Count() })
            .ToListAsync(cancellationToken);

        return Results.Ok(classes.Select(schoolClass => ToClassResponse(
            schoolClass,
            seatCounts.Count(count => count.ClassId == schoolClass.Id && count.Status == HoldStatuses.Held),
            seatCounts.Count(count => count.ClassId == schoolClass.Id && count.Status == HoldStatuses.Confirmed))));
    }

    private static async Task<IResult> GetClassAsync(
        string classId,
        SchoolDbContext database,
        CancellationToken cancellationToken)
    {
        await ExpireOverdueHoldsAsync(database, DateTimeOffset.UtcNow, cancellationToken);
        var schoolClass = await database.Classes.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == classId, cancellationToken);
        if (schoolClass is null)
        {
            return NotFound("ক্লাসটি খুঁজে পাওয়া যায়নি।");
        }

        var heldSeats = await database.Holds.CountAsync(
            hold => hold.ClassId == classId && hold.Status == HoldStatuses.Held,
            cancellationToken);
        var confirmedSeats = await database.Holds.CountAsync(
            hold => hold.ClassId == classId && hold.Status == HoldStatuses.Confirmed,
            cancellationToken);

        return Results.Ok(ToClassResponse(schoolClass, heldSeats, confirmedSeats));
    }

    private static async Task<IResult> CreateHoldAsync(
        string classId,
        HttpRequest request,
        SchoolDbContext database,
        HoldOptions holdOptions,
        CancellationToken cancellationToken)
    {
        if (!TryGetStudentId(request, out var studentId))
        {
            return BadRequest("X-Student-Id header-এ সঠিক ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর দিন।");
        }

        await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);
        var classExists = await LockRowAsync(database, "Classes", classId, cancellationToken);
        var schoolClass = classExists
            ? await database.Classes.SingleOrDefaultAsync(item => item.Id == classId, cancellationToken)
            : null;
        if (schoolClass is null)
        {
            return NotFound("ক্লাসটি খুঁজে পাওয়া যায়নি।");
        }

        var now = DateTimeOffset.UtcNow;
        await ExpireClassHoldsAsync(database, classId, now, cancellationToken);

        var existingHold = await database.Holds.AnyAsync(
            hold => hold.ClassId == classId &&
                    hold.StudentId == studentId &&
                    (hold.Status == HoldStatuses.Held || hold.Status == HoldStatuses.Confirmed),
            cancellationToken);
        if (existingHold)
        {
            return Conflict("এই ক্লাসে আপনার একটি সক্রিয় আবেদন বা নিশ্চিত ভর্তি আগে থেকেই আছে।");
        }

        var heldSeats = await database.Holds.CountAsync(
            hold => hold.ClassId == classId && hold.Status == HoldStatuses.Held,
            cancellationToken);
        var confirmedSeats = await database.Holds.CountAsync(
            hold => hold.ClassId == classId && hold.Status == HoldStatuses.Confirmed,
            cancellationToken);
        if (heldSeats + confirmedSeats >= schoolClass.TotalSeats)
        {
            return Conflict("দুঃখিত, এই ক্লাসে আর কোনো আসন খালি নেই।");
        }

        var hold = new AdmissionHold
        {
            Id = $"h_{Guid.NewGuid():N}",
            ClassId = classId,
            StudentId = studentId,
            Status = HoldStatuses.Held,
            ExpiresAt = now.Add(holdOptions.Duration),
            CreatedAt = now,
        };

        database.Holds.Add(hold);
        try
        {
            await database.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsActiveHoldUniqueViolation(exception))
        {
            return Conflict("এই ক্লাসে আপনার একটি সক্রিয় আবেদন বা নিশ্চিত ভর্তি আগে থেকেই আছে।");
        }

        await transaction.CommitAsync(cancellationToken);

        return Results.Created($"/holds/{hold.Id}", new CreatedHoldResponse(
            hold.Id,
            hold.ClassId,
            hold.StudentId,
            hold.Status,
            hold.ExpiresAt));
    }

    private static async Task<IResult> GetHoldAsync(
        string holdId,
        HttpRequest request,
        SchoolDbContext database,
        CancellationToken cancellationToken)
    {
        if (!TryGetStudentId(request, out var studentId))
        {
            return BadRequest("X-Student-Id header-এ সঠিক ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর দিন।");
        }

        var hold = await database.Holds.SingleOrDefaultAsync(
            item => item.Id == holdId && item.StudentId == studentId,
            cancellationToken);
        if (hold is null)
        {
            return NotFound("আবেদনটি খুঁজে পাওয়া যায়নি।");
        }

        await ExpireHoldIfNeededAsync(database, hold, DateTimeOffset.UtcNow, cancellationToken);
        return Results.Ok(ToHoldResponse(hold));
    }

    private static async Task<IResult> ConfirmHoldAsync(
        string holdId,
        HttpRequest request,
        SchoolDbContext database,
        CancellationToken cancellationToken)
    {
        if (!TryGetStudentId(request, out var studentId))
        {
            return BadRequest("X-Student-Id header-এ সঠিক ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর দিন।");
        }

        await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);
        var holdExists = await LockRowAsync(database, "Holds", holdId, cancellationToken);
        var hold = holdExists
            ? await database.Holds.SingleOrDefaultAsync(item => item.Id == holdId, cancellationToken)
            : null;
        if (hold is null || hold.StudentId != studentId)
        {
            return NotFound("আবেদনটি খুঁজে পাওয়া যায়নি।");
        }

        var now = DateTimeOffset.UtcNow;
        await ExpireHoldIfNeededAsync(database, hold, now, cancellationToken);
        if (hold.Status == HoldStatuses.Confirmed)
        {
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new HoldStatusResponse(hold.Id, hold.Status));
        }

        if (hold.Status != HoldStatuses.Held)
        {
            await transaction.CommitAsync(cancellationToken);
            return Conflict("এই আবেদনের সময়সীমা শেষ বা আবেদনটি আর সক্রিয় নেই।");
        }

        hold.Status = HoldStatuses.Confirmed;
        hold.ExpiresAt = null;
        await database.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return Results.Ok(new HoldStatusResponse(hold.Id, hold.Status));
    }

    private static async Task<IResult> CancelHoldAsync(
        string holdId,
        HttpRequest request,
        SchoolDbContext database,
        CancellationToken cancellationToken)
    {
        if (!TryGetStudentId(request, out var studentId))
        {
            return BadRequest("X-Student-Id header-এ সঠিক ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর দিন।");
        }

        await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);
        var holdExists = await LockRowAsync(database, "Holds", holdId, cancellationToken);
        var hold = holdExists
            ? await database.Holds.SingleOrDefaultAsync(item => item.Id == holdId, cancellationToken)
            : null;
        if (hold is null || hold.StudentId != studentId)
        {
            return NotFound("আবেদনটি খুঁজে পাওয়া যায়নি।");
        }

        if (hold.Status is HoldStatuses.Held or HoldStatuses.Confirmed)
        {
            await ExpireHoldIfNeededAsync(database, hold, DateTimeOffset.UtcNow, cancellationToken);
        }

        if (hold.Status is HoldStatuses.Held or HoldStatuses.Confirmed)
        {
            hold.Status = HoldStatuses.Cancelled;
            hold.ExpiresAt = null;
            await database.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> GetMyHoldsAsync(
        HttpRequest request,
        SchoolDbContext database,
        CancellationToken cancellationToken)
    {
        if (!TryGetStudentId(request, out var studentId))
        {
            return BadRequest("X-Student-Id header-এ সঠিক ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর দিন।");
        }

        await ExpireStudentHoldsAsync(database, studentId, DateTimeOffset.UtcNow, cancellationToken);
        var holds = await database.Holds
            .AsNoTracking()
            .Where(hold => hold.StudentId == studentId)
            .OrderByDescending(hold => hold.Status == HoldStatuses.Held)
            .ThenByDescending(hold => hold.CreatedAt)
            .Select(hold => new MyHoldResponse(
                hold.Id,
                hold.ClassId,
                hold.Class.Name,
                hold.Status,
                hold.ExpiresAt))
            .ToListAsync(cancellationToken);

        return Results.Ok(holds);
    }

    private static async Task ExpireOverdueHoldsAsync(
        SchoolDbContext database,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await database.Holds
            .Where(hold => hold.Status == HoldStatuses.Held && hold.ExpiresAt <= now)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(hold => hold.Status, HoldStatuses.Expired),
                cancellationToken);
    }

    private static async Task ExpireClassHoldsAsync(
        SchoolDbContext database,
        string classId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await database.Holds
            .Where(hold =>
                hold.ClassId == classId &&
                hold.Status == HoldStatuses.Held &&
                hold.ExpiresAt <= now)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(hold => hold.Status, HoldStatuses.Expired),
                cancellationToken);
    }

    private static async Task ExpireStudentHoldsAsync(
        SchoolDbContext database,
        string studentId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await database.Holds
            .Where(hold =>
                hold.StudentId == studentId &&
                hold.Status == HoldStatuses.Held &&
                hold.ExpiresAt <= now)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(hold => hold.Status, HoldStatuses.Expired),
                cancellationToken);
    }

    private static async Task ExpireHoldIfNeededAsync(
        SchoolDbContext database,
        AdmissionHold hold,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (hold.Status == HoldStatuses.Held && hold.ExpiresAt <= now)
        {
            hold.Status = HoldStatuses.Expired;
            await database.SaveChangesAsync(cancellationToken);
        }
    }

    private static async Task<bool> LockRowAsync(
        SchoolDbContext database,
        string tableName,
        string id,
        CancellationToken cancellationToken)
    {
        await using var command = database.Database.GetDbConnection().CreateCommand();
        command.CommandText = $"SELECT 1 FROM \"{tableName}\" WHERE \"Id\" = @id FOR UPDATE";
        command.Transaction = database.Database.CurrentTransaction!.GetDbTransaction();
        var idParameter = command.CreateParameter();
        idParameter.ParameterName = "id";
        idParameter.Value = id;
        command.Parameters.Add(idParameter);

        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    private static ClassResponse ToClassResponse(SchoolClass schoolClass, int heldSeats, int confirmedSeats) =>
        new(
            schoolClass.Id,
            schoolClass.Name,
            schoolClass.TotalSeats,
            heldSeats,
            confirmedSeats,
            Math.Max(0, schoolClass.TotalSeats - heldSeats - confirmedSeats));

    private static HoldResponse ToHoldResponse(AdmissionHold hold) =>
        new(hold.Id, hold.ClassId, hold.Status, hold.ExpiresAt);

    private static bool TryGetStudentId(HttpRequest request, out string studentId)
    {
        studentId = request.Headers["X-Student-Id"].ToString();
        return StudentIdPattern().IsMatch(studentId);
    }

    private static bool IsActiveHoldUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: ActiveHoldConstraint,
        };

    private static IResult BadRequest(string message) =>
        Results.Json(new ErrorResponse(message), statusCode: StatusCodes.Status400BadRequest);

    private static IResult NotFound(string message) =>
        Results.Json(new ErrorResponse(message), statusCode: StatusCodes.Status404NotFound);

    private static IResult Conflict(string message) =>
        Results.Json(new ErrorResponse(message), statusCode: StatusCodes.Status409Conflict);

    public sealed record CreateClassRequest(string? Name, int TotalSeats);

    public sealed record CreatedClassResponse(string Id, string Name, int TotalSeats);

    public sealed record ClassResponse(
        string Id,
        string Name,
        int TotalSeats,
        int HeldSeats,
        int ConfirmedSeats,
        int AvailableSeats);

    public sealed record CreatedHoldResponse(
        string HoldId,
        string ClassId,
        string StudentId,
        string Status,
        DateTimeOffset? ExpiresAt);

    public sealed record HoldResponse(
        string HoldId,
        string ClassId,
        string Status,
        DateTimeOffset? ExpiresAt);

    public sealed record HoldStatusResponse(string HoldId, string Status);

    public sealed record MyHoldResponse(
        string HoldId,
        string ClassId,
        string ClassName,
        string Status,
        DateTimeOffset? ExpiresAt);

    private sealed record ErrorResponse(string Message);
}
