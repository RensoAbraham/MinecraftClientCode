package one.unicornio.paputauth;

public record SessionClaims(String accountId, String name, String deviceId, String audience, long issuedAt, long expiresAt, String tokenId) {}
