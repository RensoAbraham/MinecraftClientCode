package one.unicornio.paputauth;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import net.minecraft.network.chat.Component;
import net.neoforged.neoforge.network.handling.IPayloadContext;

public final class ClientAuthHandler {
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    public static void handleRequest(AuthRequestPayload payload, IPayloadContext context) {
        try {
            int port = Integer.parseInt(System.getProperty("paput.bridgePort", "0"));
            String secret = System.getProperty("paput.bridgeSecret", "");
            String localAudience = System.getProperty("paput.audience", "");
            if (port < 1 || port > 65535 || secret.isBlank() || !payload.audience().equals(localAudience)) {
                throw new IllegalStateException("Abre el juego desde Paput Client para entrar a este servidor.");
            }

            HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/session"))
                    .timeout(Duration.ofSeconds(8))
                    .header("Authorization", "Bearer " + secret)
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new IllegalStateException(readError(response.body()));
            }
            JsonObject body = JsonParser.parseString(response.body()).getAsJsonObject();
            String token = body.get("token").getAsString();
            if (token.length() > 16_384) throw new IllegalStateException("La sesión recibida no es válida.");
            context.reply(new AuthTokenPayload(token));
        } catch (Exception error) {
            PaputAuth.LOGGER.warn("No se pudo obtener la sesión del launcher: {}", error.getMessage());
            context.disconnect(Component.literal(message(error)));
        }
    }

    private static String readError(String json) {
        try {
            JsonObject body = JsonParser.parseString(json).getAsJsonObject();
            if (body.has("message")) return body.get("message").getAsString();
        } catch (Exception ignored) {}
        return "Paput Client no pudo autorizar esta conexión.";
    }

    private static String message(Exception error) {
        String message = error.getMessage();
        return message == null || message.isBlank() ? "Paput Client no pudo autorizar esta conexión." : message;
    }

    private ClientAuthHandler() {}
}
