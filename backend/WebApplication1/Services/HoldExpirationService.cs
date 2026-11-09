using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Services;

public sealed class HoldExpirationService(
    IServiceScopeFactory scopeFactory,
    ILogger<HoldExpirationService> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);

        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var database = scope.ServiceProvider.GetRequiredService<SchoolDbContext>();
                var now = DateTimeOffset.UtcNow;

                await database.Holds
                    .Where(hold =>
                        hold.Status == HoldStatuses.Held &&
                        hold.ExpiresAt <= now)
                    .ExecuteUpdateAsync(
                        setters => setters.SetProperty(hold => hold.Status, HoldStatuses.Expired),
                        stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "The hold expiration worker stopped unexpectedly.");
            throw;
        }
    }
}
