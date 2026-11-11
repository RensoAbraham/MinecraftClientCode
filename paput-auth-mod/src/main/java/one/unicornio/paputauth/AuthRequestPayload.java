package one.unicornio.paputauth;

import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

public record AuthRequestPayload(String audience) implements CustomPacketPayload {
    public static final Type<AuthRequestPayload> TYPE = new Type<>(
            ResourceLocation.fromNamespaceAndPath(PaputAuth.MOD_ID, "request"));
    public static final StreamCodec<ByteBuf, AuthRequestPayload> STREAM_CODEC = StreamCodec.composite(
            ByteBufCodecs.STRING_UTF8,
            AuthRequestPayload::audience,
            AuthRequestPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
