package com.tt.traintravelermod;

import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.MinecraftServer;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

public class TrainTravelerCommand {

    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    private static volatile String cachedPublicIp = null;

    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(
            Commands.literal("traintraveler")
                .then(Commands.literal("website")
                    .executes(context -> {
                        CommandSourceStack source = context.getSource();
                        MinecraftServer server = source.getServer();

                        // Esegue la risoluzione in background per non bloccare il tick thread del server
                        CompletableFuture.supplyAsync(() -> buildWebsiteUrl(server))
                            .thenAccept(url -> server.execute(() -> sendDashboardLink(source, url)));

                        return 1;
                    })
                )
        );
    }

    private static void sendDashboardLink(CommandSourceStack source, String url) {
        MutableComponent link = Component.literal(url)
            .withStyle(style -> style
                .withColor(ChatFormatting.AQUA)
                .withUnderlined(true)
                .withClickEvent(new ClickEvent(ClickEvent.Action.OPEN_URL, url))
                .withHoverEvent(new HoverEvent(
                    HoverEvent.Action.SHOW_TEXT,
                    Component.literal("Click to open the Create: Train Traveler")
                        .withStyle(ChatFormatting.GRAY)
                ))
            );

        MutableComponent message = Component.literal("[Train Traveler] ")
            .withStyle(ChatFormatting.GOLD, ChatFormatting.BOLD)
            .append(Component.literal("Live Dashboard: ").withStyle(ChatFormatting.WHITE))
            .append(link);

        source.sendSuccess(() -> message, false);
    }

    private static String buildWebsiteUrl(MinecraftServer server) {
        int port = Config.API_PORT.get();
        String configuredHost = Config.PUBLIC_HOST.get();

        // 1. Override manuale se impostato in config (es. dominio personalizzato)
        if (configuredHost != null && !configuredHost.isBlank()) {
            String host = configuredHost.trim();
            while (host.endsWith("/")) {
                host = host.substring(0, host.length() - 1);
            }
            if (host.startsWith("http://") || host.startsWith("https://")) {
                return host;
            }
            if (host.contains(":")) {
                return "http://" + host;
            }
            return "http://" + host + ":" + port;
        }

        // 2. Singleplayer: usa localhost
        if (!server.isDedicatedServer()) {
            return "http://localhost:" + port;
        }

        // 3. Controlla server-ip in server.properties
        String localIp = server.getLocalIp();
        if (localIp != null && !localIp.isBlank() && !localIp.equals("0.0.0.0") && !localIp.equals("127.0.0.1")) {
            return "http://" + localIp.trim() + ":" + port;
        }

        // 4. Rilevamento automatico IP pubblico del server (con cache)
        String detectedIp = detectPublicIp();
        if (detectedIp != null && !detectedIp.isBlank()) {
            return "http://" + detectedIp + ":" + port;
        }

        // 5. Fallback finale
        return "http://localhost:" + port;
    }

    private static String detectPublicIp() {
        if (cachedPublicIp != null) {
            return cachedPublicIp;
        }

        String[] providers = {
            "https://api.ipify.org",
            "https://checkip.amazonaws.com",
            "https://ifconfig.me/ip"
        };

        for (String provider : providers) {
            try {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(provider))
                        .timeout(Duration.ofSeconds(3))
                        .GET()
                        .build();

                HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() == 200 && response.body() != null) {
                    String ip = response.body().trim();
                    if (!ip.isEmpty() && ip.length() <= 45) {
                        cachedPublicIp = ip;
                        return ip;
                    }
                }
            } catch (Exception ignored) {
                // Prova il provider successivo
            }
        }

        return null;
    }
}