using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace SchoolAdmission.Api.Tests;

[CollectionDefinition(Name, DisableParallelization = true)]
public sealed class AdmissionApiCollection : ICollectionFixture<PostgresFixture>
{
    public const string Name = "Admission API";
}

public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly string? _previousConnectionString =
        Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");
    private readonly string? _previousHoldDuration =
        Environment.GetEnvironmentVariable("HOLD_DURATION_SECONDS");
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:15-alpine")
        .WithDatabase("school_test")
        .WithUsername("postgres")
        .WithPassword("school_test_password")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", ConnectionString);
        Environment.SetEnvironmentVariable("HOLD_DURATION_SECONDS", "600");
    }

    public async Task DisposeAsync()
    {
        try
        {
            await _container.DisposeAsync();
        }
        finally
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", _previousConnectionString);
            Environment.SetEnvironmentVariable("HOLD_DURATION_SECONDS", _previousHoldDuration);
        }
    }
}

[Collection(AdmissionApiCollection.Name)]
public sealed class AdmissionApiTests(PostgresFixture postgres)
{
    private static long _studentSequence;
    private readonly PostgresFixture _postgres = postgres;

    [Fact]
    public async Task HoldRequestsNeverExceedClassCapacity()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var classId = await CreateClassAsync(client, totalSeats: 2);
        var firstStudentId = NewStudentId();

        using var firstHold = await CreateHoldAsync(client, classId, firstStudentId);
        using var duplicateHold = await CreateHoldAsync(client, classId, firstStudentId);
        using var secondHold = await CreateHoldAsync(client, classId, NewStudentId());
        using var fullClassHold = await CreateHoldAsync(client, classId, NewStudentId());
        Assert.Equal(HttpStatusCode.Created, firstHold.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, duplicateHold.StatusCode);
        Assert.Equal(HttpStatusCode.Created, secondHold.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, fullClassHold.StatusCode);

        using var classResponse = await client.GetAsync($"/classes/{classId}");
        classResponse.EnsureSuccessStatusCode();
        using var classJson = JsonDocument.Parse(await classResponse.Content.ReadAsStringAsync());
        Assert.Equal(2, classJson.RootElement.GetProperty("heldSeats").GetInt32());
        Assert.Equal(0, classJson.RootElement.GetProperty("availableSeats").GetInt32());
    }

    [Fact]
    public async Task ExpiredHoldIsReleasedAutomaticallyAndCanBeReplaced()
    {
        using var factory = CreateFactory(holdDurationSeconds: 1);
        using var client = factory.CreateClient();
        var classId = await CreateClassAsync(client, totalSeats: 1);
        var studentId = NewStudentId();
        using var holdResponse = await CreateHoldAsync(client, classId, studentId);
        Assert.Equal(HttpStatusCode.Created, holdResponse.StatusCode);
        using var holdJson = JsonDocument.Parse(await holdResponse.Content.ReadAsStringAsync());
        var holdId = holdJson.RootElement.GetProperty("holdId").GetString();
        Assert.False(string.IsNullOrWhiteSpace(holdId));

        await using var database = new NpgsqlConnection(_postgres.ConnectionString);
        await database.OpenAsync();
        await using var command = database.CreateCommand();
        command.CommandText = """SELECT "Status" FROM "Holds" WHERE "Id" = @holdId""";
        command.Parameters.AddWithValue("holdId", holdId);

        string? status = null;
        var timeout = DateTimeOffset.UtcNow.AddSeconds(5);
        while (DateTimeOffset.UtcNow < timeout)
        {
            status = (string?)await command.ExecuteScalarAsync();
            if (status == "EXPIRED")
            {
                break;
            }

            await Task.Delay(100);
        }

        Assert.Equal("EXPIRED", status);
        using var replacementHold = await CreateHoldAsync(client, classId, studentId);
        Assert.Equal(HttpStatusCode.Created, replacementHold.StatusCode);
    }

    [Fact]
    public async Task ClassAndHoldDataSurviveApiRestart()
    {
        string classId;
        using (var firstFactory = CreateFactory())
        using (var firstClient = firstFactory.CreateClient())
        {
            classId = await CreateClassAsync(firstClient, totalSeats: 1);
            using var hold = await CreateHoldAsync(firstClient, classId, NewStudentId());
            Assert.Equal(HttpStatusCode.Created, hold.StatusCode);
        }

        using var restartedFactory = CreateFactory();
        using var restartedClient = restartedFactory.CreateClient();
        using var classResponse = await restartedClient.GetAsync($"/classes/{classId}");
        classResponse.EnsureSuccessStatusCode();
        using var classJson = JsonDocument.Parse(await classResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, classJson.RootElement.GetProperty("heldSeats").GetInt32());
    }

    [Fact]
    public async Task OnlyOwnerCanConfirmAndRepeatedConfirmationIsIdempotent()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var classId = await CreateClassAsync(client, totalSeats: 1);
        var studentId = NewStudentId();
        var holdResponse = await CreateHoldAsync(client, classId, studentId);
        Assert.Equal(HttpStatusCode.Created, holdResponse.StatusCode);
        using var holdJson = JsonDocument.Parse(await holdResponse.Content.ReadAsStringAsync());
        var holdId = holdJson.RootElement.GetProperty("holdId").GetString();
        Assert.False(string.IsNullOrWhiteSpace(holdId));

        Assert.Equal(HttpStatusCode.NotFound, (await ConfirmHoldAsync(client, holdId!, NewStudentId())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ConfirmHoldAsync(client, holdId!, studentId)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await ConfirmHoldAsync(client, holdId!, studentId)).StatusCode);

        using var classResponse = await client.GetAsync($"/classes/{classId}");
        classResponse.EnsureSuccessStatusCode();
        using var classJson = JsonDocument.Parse(await classResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, classJson.RootElement.GetProperty("confirmedSeats").GetInt32());
        Assert.Equal(0, classJson.RootElement.GetProperty("heldSeats").GetInt32());
    }

    [Fact]
    public async Task ConcurrentRequestsForLastSeatAllowExactlyOneHold()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var classId = await CreateClassAsync(client, totalSeats: 1);
        const int requestCount = 20;
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var requests = Enumerable.Range(0, requestCount)
            .Select(async _ =>
            {
                var studentId = NewStudentId();
                using var request = new HttpRequestMessage(HttpMethod.Post, $"/classes/{classId}/holds");
                request.Headers.Add("X-Student-Id", studentId);
                await start.Task;
                return await client.SendAsync(request);
            })
            .ToArray();

        start.SetResult();
        var responses = await Task.WhenAll(requests);
        try
        {
            Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);
            Assert.Equal(
                requestCount - 1,
                responses.Count(response => response.StatusCode == HttpStatusCode.Conflict));

            using var classResponse = await client.GetAsync($"/classes/{classId}");
            classResponse.EnsureSuccessStatusCode();
            using var classJson = JsonDocument.Parse(await classResponse.Content.ReadAsStringAsync());
            Assert.Equal(1, classJson.RootElement.GetProperty("heldSeats").GetInt32());
            Assert.Equal(0, classJson.RootElement.GetProperty("availableSeats").GetInt32());
        }
        finally
        {
            foreach (var response in responses)
            {
                response.Dispose();
            }
        }
    }

    private WebApplicationFactory<Program> CreateFactory(int holdDurationSeconds = 600)
    {
        Environment.SetEnvironmentVariable(
            "ConnectionStrings__DefaultConnection",
            _postgres.ConnectionString);
        Environment.SetEnvironmentVariable(
            "HOLD_DURATION_SECONDS",
            holdDurationSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture));
        return new WebApplicationFactory<Program>();
    }

    private static async Task<string> CreateClassAsync(HttpClient client, int totalSeats)
    {
        var response = await client.PostAsJsonAsync("/classes", new
        {
            name = $"Automated test {Guid.NewGuid():N}",
            totalSeats,
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("id").GetString()
            ?? throw new InvalidOperationException("The class creation response did not contain an ID.");
    }

    private static Task<HttpResponseMessage> CreateHoldAsync(HttpClient client, string classId, string studentId) =>
        SendStudentRequestAsync(client, HttpMethod.Post, $"/classes/{classId}/holds", studentId);

    private static Task<HttpResponseMessage> ConfirmHoldAsync(
        HttpClient client,
        string holdId,
        string studentId) =>
        SendStudentRequestAsync(client, HttpMethod.Post, $"/holds/{holdId}/confirm", studentId);

    private static async Task<HttpResponseMessage> SendStudentRequestAsync(
        HttpClient client,
        HttpMethod method,
        string path,
        string studentId)
    {
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Add("X-Student-Id", studentId);
        return await client.SendAsync(request);
    }

    private static string NewStudentId() => (10_000_000_000_000_000L + Interlocked.Increment(ref _studentSequence))
        .ToString(System.Globalization.CultureInfo.InvariantCulture);
}
