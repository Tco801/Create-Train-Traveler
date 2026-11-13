package com.tt.traintravellermod;

import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;

public class TrainTravellerCommand {

    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(
            Commands.literal("traintraveller")
                .then(Commands.literal("website")
                    .executes(context -> {
                        String url = buildWebsiteUrl();

                        MutableComponent link = Component.literal(url)
                            .withStyle(style -> style
                                .withColor(ChatFormatting.AQUA)
                                .withUnderlined(true)
                                .withClickEvent(new ClickEvent(ClickEvent.Action.OPEN_URL, url))
                                .withHoverEvent(new HoverEvent(
                                    HoverEvent.Action.SHOW_TEXT,
                                    Component.literal("Click to open the Create: Train Traveller")
                                        .withStyle(ChatFormatting.GRAY)
                                ))
                            );

                        MutableComponent message = Component.literal("[Train Traveller] ")
                            .withStyle(ChatFormatting.GOLD, ChatFormatting.BOLD)
                            .append(Component.literal("Live Dashboard: ").withStyle(ChatFormatting.WHITE))
                            .append(link);

                        context.getSource().sendSuccess(() -> message, false);
                        return 1;
                    })
                )
        );
    }

    private static String buildWebsiteUrl() {
        int port = Config.API_PORT.get();
        String configuredHost = Config.PUBLIC_HOST.get();

        if (configuredHost != null && !configuredHost.isBlank()) {
            String host = configuredHost.trim();
            // Rimuove eventuali slash finali
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

        return "http://localhost:" + port;
    }
}