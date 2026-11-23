FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM maven:3.9.11-eclipse-temurin-21 AS backend
WORKDIR /build
COPY backend/pom.xml backend/pom.xml
RUN mvn -B -ntp -f backend/pom.xml dependency:go-offline
COPY backend/src backend/src
COPY --from=frontend /build/frontend/dist frontend/dist
RUN mvn -B -ntp -f backend/pom.xml package -DskipTests

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY --from=backend /build/backend/target/companykeeping.jar /app/companykeeping.jar
ENV HOST=0.0.0.0 PORT=4317
USER 10001:10001
EXPOSE 4317
ENTRYPOINT ["java", "-jar", "/app/companykeeping.jar"]
