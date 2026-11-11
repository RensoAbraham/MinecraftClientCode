package one.unicornio.paputauth;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

public final class SessionTokenVerifier {
    private static final Pattern UUID = Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", Pattern.CASE_INSENSITIVE);
    private static final Pattern NAME = Pattern.compile("^[A-Za-z0-9_]{3,16}$");
    private static final Map<String, Long> USED_TOKENS = new ConcurrentHashMap<>();

    public static SessionClaims verify(String token, String expectedAudience, String expectedKeyId, String publicKeyBase64Url) throws Exception {
        String[] parts = token.split("\\.", -1);
        if (parts.length != 3) throw new IllegalArgumentException("Formato de sesión inválido.");

        JsonObject header = json(parts[0]);
        if (!"EdDSA".equals(text(header, "alg")) || !expectedKeyId.equals(text(header, "kid"))) {
            throw new IllegalArgumentException("Clave de sesión desconocida.");
        }

        PublicKey key = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(decode(publicKeyBase64Url)));
        Signature verifier = Signature.getInstance("Ed25519");
        verifier.initVerify(key);
        verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(decode(parts[2]))) throw new IllegalArgumentException("Firma de sesión inválida.");

        JsonObject payload = json(parts[1]);
        SessionClaims claims = new SessionClaims(
                text(payload, "sub"), text(payload, "name"), text(payload, "device_id"),
                text(payload, "aud"), number(payload, "iat"), number(payload, "exp"), text(payload, "jti"));
        long now = Instant.now().getEpochSecond();
        if (!UUID.matcher(claims.accountId()).matches() || !UUID.matcher(claims.deviceId()).matches()
                || !UUID.matcher(claims.tokenId()).matches() || !NAME.matcher(claims.name()).matches()) {
            throw new IllegalArgumentException("Identidad de sesión inválida.");
        }
        if (!expectedAudience.equals(claims.audience())) throw new IllegalArgumentException("La sesión pertenece a otra instancia.");
        if (claims.expiresAt() < now - 5 || claims.issuedAt() > now + 15 || claims.expiresAt() - claims.issuedAt() > 180) {
            throw new IllegalArgumentException("La sesión caducó.");
        }

        USED_TOKENS.entrySet().removeIf(entry -> entry.getValue() < now);
        if (USED_TOKENS.putIfAbsent(claims.tokenId(), claims.expiresAt()) != null) {
            throw new IllegalArgumentException("La sesión ya fue utilizada.");
        }
        return claims;
    }

    private static JsonObject json(String encoded) {
        return JsonParser.parseString(new String(decode(encoded), StandardCharsets.UTF_8)).getAsJsonObject();
    }

    private static byte[] decode(String value) {
        return Base64.getUrlDecoder().decode(value);
    }

    private static String text(JsonObject object, String name) {
        if (!object.has(name) || !object.get(name).isJsonPrimitive()) throw new IllegalArgumentException("Falta " + name + ".");
        return object.get(name).getAsString();
    }

    private static long number(JsonObject object, String name) {
        if (!object.has(name) || !object.get(name).isJsonPrimitive()) throw new IllegalArgumentException("Falta " + name + ".");
        return object.get(name).getAsLong();
    }

    private SessionTokenVerifier() {}
}
