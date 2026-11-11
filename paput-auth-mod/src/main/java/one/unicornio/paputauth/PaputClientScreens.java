package one.unicornio.paputauth;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ScreenEvent;

@EventBusSubscriber(modid = PaputAuth.MOD_ID, value = Dist.CLIENT)
public final class PaputClientScreens {
    @SubscribeEvent
    public static void onScreenOpening(ScreenEvent.Opening event) {
        Screen next = event.getNewScreen();
        if (next instanceof TitleScreen || next instanceof JoinMultiplayerScreen || next instanceof SelectWorldScreen) {
            event.setNewScreen(new PaputTitleScreen());
        }
    }

    private PaputClientScreens() {}

    private static final class PaputTitleScreen extends Screen {
        private static final Component TITLE = Component.literal("PAPUT CLIENT");
        private final String serverAddress = System.getProperty("paput.serverAddress", "").trim();

        private PaputTitleScreen() {
            super(TITLE);
        }

        @Override
        protected void init() {
            int buttonWidth = 220;
            int x = (width - buttonWidth) / 2;
            int y = height / 2 - 10;

            Button play = Button.builder(Component.literal("Jugar"), ignored -> connect())
                    .bounds(x, y, buttonWidth, 24)
                    .build();
            play.active = !serverAddress.isBlank() && ServerAddress.isValidAddress(serverAddress);
            addRenderableWidget(play);
            addRenderableWidget(Button.builder(
                    Component.literal("Opciones"),
                    ignored -> minecraft.setScreen(new OptionsScreen(this, minecraft.options)))
                    .bounds(x, y + 30, buttonWidth, 24)
                    .build());
            addRenderableWidget(Button.builder(Component.literal("Salir"), ignored -> minecraft.stop())
                    .bounds(x, y + 60, buttonWidth, 24)
                    .build());
        }

        private void connect() {
            ServerData server = new ServerData("Servidor Paput", serverAddress, ServerData.Type.OTHER);
            ConnectScreen.startConnecting(
                    this,
                    Minecraft.getInstance(),
                    ServerAddress.parseString(serverAddress),
                    server,
                    true,
                    null);
        }

        @Override
        public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
            renderBackground(graphics, mouseX, mouseY, partialTick);
            graphics.fill(0, 0, width, height, 0x77070A0C);
            graphics.drawCenteredString(font, TITLE, width / 2, height / 2 - 76, 0xFFF2F1ED);
            graphics.drawCenteredString(
                    font,
                    Component.literal(serverAddress.isBlank() ? "Servidor pendiente de configurar" : "Tu mundo está listo"),
                    width / 2,
                    height / 2 - 56,
                    serverAddress.isBlank() ? 0xFFE2A84A : 0xFFB8B6AE);
            super.render(graphics, mouseX, mouseY, partialTick);
        }

        @Override
        public boolean shouldCloseOnEsc() {
            return false;
        }

        @Override
        public boolean isPauseScreen() {
            return false;
        }
    }
}
