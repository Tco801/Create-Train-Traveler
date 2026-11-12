package com.tt.traintravellermod;

import com.google.gson.Gson;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.slf4j.Logger;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ApiServer {
    private static final Logger LOGGER = org.slf4j.LoggerFactory.getLogger(ApiServer.class);
    private static final Gson GSON = new Gson();
    private static final String WEB_ROOT = "/assets/createtraintraveller/web";

    private static HttpServer server;
    private static ExecutorService executor;

    public static ServerSnapshot currentSnapshot = ServerSnapshot.empty();

    public static void start(int port) {
        if (server != null) {
            return;
        }

        try {
            server = HttpServer.create(new InetSocketAddress(port), 0);
            executor = Executors.newCachedThreadPool();
            server.setExecutor(executor);

            server.createContext("/", ApiServer::handleRequest);
            server.start();

            LOGGER.info("Web & API server started on port {}", port);
        } catch (IOException e) {
            LOGGER.error("Failed to start API server on port {}", port, e);
        }
    }

    public static void stop() {
        if (server == null) {
            return;
        }

        server.stop(0);
        server = null;

        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }

        LOGGER.info("API server stopped");
    }

    private static void handleRequest(HttpExchange exchange) throws IOException {
        try {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                addCorsHeaders(exchange.getResponseHeaders());
                exchange.sendResponseHeaders(204, -1);
                exchange.close();
                return;
            }

            String path = exchange.getRequestURI().getPath();

            // 1. Rotte API (richiedono X-API-Key se configurata)
            if (path.startsWith("/crn/api/") || "/snapshot".equals(path)) {
                if (!isAuthorized(exchange)) {
                    sendJson(exchange, 401, Map.of("error", "unauthorized"));
                    return;
                }

                if ("/snapshot".equals(path) || "/crn/api/v1/snapshot".equals(path)) {
                    sendJson(exchange, 200, Map.of(
                            "status", "ok",
                            "snapshot", currentSnapshot
                    ));
                    return;
                }

                if ("/crn/api/v1/stations".equals(path)) {
                    sendJson(exchange, 200, currentSnapshot.stations);
                    return;
                }

                if ("/crn/api/v1/trains".equals(path)) {
                    sendJson(exchange, 200, currentSnapshot.trains);
                    return;
                }

                if ("/crn/api/v1/categories".equals(path)) {
                    sendJson(exchange, 200, currentSnapshot.categories);
                    return;
                }

                if ("/crn/api/v1/lines".equals(path)) {
                    sendJson(exchange, 200, currentSnapshot.lines);
                    return;
                }

                sendJson(exchange, 404, Map.of("error", "endpoint not found"));
                return;
            }

            // 2. File statici del sito web (sempre accessibili dal browser)
            serveStaticAsset(exchange, path);

        } catch (Exception e) {
            LOGGER.error("Error while handling HTTP request", e);
            sendJson(exchange, 500, Map.of("error", "internal server error"));
        }
    }

    private static void serveStaticAsset(HttpExchange exchange, String path) throws IOException {
        String cleanPath = "/".equals(path) ? "/index.html" : path;
        if (cleanPath.contains("..")) {
            sendJson(exchange, 403, Map.of("error", "forbidden"));
            return;
        }

        String resourcePath = WEB_ROOT + cleanPath;
        try (InputStream is = ApiServer.class.getResourceAsStream(resourcePath)) {
            if (is == null) {
                sendJson(exchange, 404, Map.of("error", "not found"));
                return;
            }

            byte[] content = is.readAllBytes();
            Headers headers = exchange.getResponseHeaders();
            headers.set("Content-Type", getMimeType(cleanPath));
            addCorsHeaders(headers);

            exchange.sendResponseHeaders(200, content.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(content);
            }
        }
    }

    private static String getMimeType(String path) {
        if (path.endsWith(".html")) return "text/html; charset=UTF-8";
        if (path.endsWith(".js")) return "application/javascript; charset=UTF-8";
        if (path.endsWith(".css")) return "text/css; charset=UTF-8";
        if (path.endsWith(".json")) return "application/json; charset=UTF-8";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private static boolean isAuthorized(HttpExchange exchange) {
        String apiKey = Config.API_KEY.get();
        if (apiKey == null || apiKey.isBlank()) {
            return true;
        }

        String requestKey = exchange.getRequestHeaders().getFirst("X-API-Key");
        return apiKey.equals(requestKey);
    }

    private static void addCorsHeaders(Headers headers) {
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
        headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    }

    private static void sendJson(HttpExchange exchange, int statusCode, Object payload) throws IOException {
        byte[] response = GSON.toJson(payload).getBytes(StandardCharsets.UTF_8);
        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", "application/json; charset=UTF-8");
        addCorsHeaders(headers);

        exchange.sendResponseHeaders(statusCode, response.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(response);
        }
    }
}