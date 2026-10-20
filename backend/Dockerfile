FROM amazoncorretto:21-alpine-jdk AS build

WORKDIR /workspace

COPY gradlew build.gradle settings.gradle gradle.properties ./
COPY gradle ./gradle
COPY src ./src

# テストは別途実行し、クリーンなソースから実行用JARだけを生成する。
RUN sh ./gradlew --no-daemon bootJar \
    && mv build/libs/*.jar /app.jar

FROM amazoncorretto:21-alpine-jdk AS runtime

RUN apk add --no-cache curl \
    && addgroup -S joblens \
    && adduser -S -G joblens -H joblens

WORKDIR /app

COPY --from=build --chown=joblens:joblens /app.jar ./app.jar

USER joblens:joblens

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
