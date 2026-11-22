# UNTESTED: written without running Docker. Build it and try one request before relying on it.
# Runs the aligner on a Linux server. See aligner/README.md, section «На сервере».
#
#   docker build -t karaokecraft-aligner aligner
#   docker run -d -p 8787:8787 -v aligner-models:/models karaokecraft-aligner
#
# Listening on 0.0.0.0 turns on the Firebase ID token check for every request (ALIGNER_REQUIRE_AUTH).

FROM rust:1-bookworm AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends cmake clang libclang-dev \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
# Portable build; on a known CPU, GGML_NATIVE=ON is faster.
ENV GGML_NATIVE=OFF
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/target/release/aligner /app/aligner
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
ENV ALIGNER_HOST=0.0.0.0 \
    ALIGNER_PORT=8787 \
    ALIGNER_PUBLIC=0 \
    WHISPER_MODEL=/models/ggml-small.bin
VOLUME /models
EXPOSE 8787
ENTRYPOINT ["/app/docker-entrypoint.sh"]
