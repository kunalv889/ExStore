FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
EXPOSE 8080
ENV ASPNETCORE_HTTP_PORTS=8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["ExStore.API/ExStore.API.csproj", "ExStore.API/"]
RUN dotnet restore "ExStore.API/ExStore.API.csproj"
COPY . .
WORKDIR "/src/ExStore.API"
RUN dotnet publish "ExStore.API.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM runtime AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ExStore.API.dll"]
