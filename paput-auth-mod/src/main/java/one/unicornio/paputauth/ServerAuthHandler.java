package one.unicornio.paputauth;

import net.minecraft.network.chat.Component;
import net.neoforged.neoforge.network.handling.IPayloadContext;

public final class ServerAuthHandler {
    public static void handleToken(AuthTokenPayload payload, IPayloadContext context) {
        try {
            String expectedName = ServerIdentityTracker.takeName(context.connection());
            if (expectedName == null) throw new IllegalArgumentException("No se pudo comprobar el nombre de conexión.");
            String publicKey = PaputServerConfig.SESSION_PUBLIC_KEY.get().trim();
            if (publicKey.isBlank()) throw new IllegalStateException("Paput Auth no está configurado en el servidor.");
            SessionClaims claims = SessionTokenVerifier.verify(
                    payload.token(),
                    PaputServerConfig.AUDIENCE.get().trim(),
                    PaputServerConfig.SESSION_KEY_ID.get().trim(),
                    publicKey);
            if (!expectedName.equals(claims.name())) {
                throw new IllegalArgumentException("El nombre de Minecraft no coincide con tu cuenta aprobada.");
            }
            PaputAuth.LOGGER.info("Identidad Paput aprobada: {} ({})", claims.name(), claims.accountId());
            context.finishCurrentTask(AuthConfigurationTask.TYPE);
        } catch (Exception error) {
            PaputAuth.LOGGER.warn("Conexión Paput rechazada: {}", error.getMessage());
            context.disconnect(Component.literal(message(error)));
        }
    }

    private static String message(Exception error) {
        String message = error.getMessage();
        return message == null || message.isBlank() ? "No se pudo comprobar tu identidad Paput." : message;
    }

    private ServerAuthHandler() {}
}
