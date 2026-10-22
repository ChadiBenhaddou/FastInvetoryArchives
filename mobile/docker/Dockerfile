# Build environment for the Android app: Node 22 + JDK 21 + Android SDK 36.
# Used only on the connected development machine; the APK it produces runs fully offline.
FROM node:22-bookworm

COPY --from=eclipse-temurin:21-jdk /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk \
    ANDROID_HOME=/opt/android-sdk \
    GRADLE_OPTS="-Dorg.gradle.daemon=false"
ENV PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

ARG CMDLINE_TOOLS=16111833
RUN mkdir -p $ANDROID_HOME/cmdline-tools \
 && curl -fsSL -o /tmp/tools.zip https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip \
 && unzip -q /tmp/tools.zip -d $ANDROID_HOME/cmdline-tools \
 && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
 && rm /tmp/tools.zip \
 && yes | sdkmanager --licenses >/dev/null \
 && sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" >/dev/null

# Capacitor CLI telemetry off (dev tooling only; the app itself has no network code).
ENV CAPACITOR_TELEMETRY=false
WORKDIR /app
