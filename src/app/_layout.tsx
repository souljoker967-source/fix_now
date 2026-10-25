import { Redirect, Stack, useSegments } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { SessionProvider, useSession } from "../auth/session";
import AppColors from "../constants/app-theme";

export default function RootLayout() {
  return (
    <SessionProvider>
      <SessionRoutes />
    </SessionProvider>
  );
}

function SessionRoutes() {
  const { user, ready } = useSession();
  const segments = useSegments();
  const firstSegment = segments[0];
  const dashboard = user?.account_type === "provider" ? "/provider" : "/customer";

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: AppColors.background,
        }}
      >
        <ActivityIndicator color={AppColors.primary} />
      </View>
    );
  }

  if (!user && (firstSegment === "customer" || firstSegment === "provider")) {
    return <Redirect href="/login" />;
  }

  if (user && firstSegment !== dashboard.slice(1)) {
    return <Redirect href={dashboard} />;
  }

  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="customer" options={{ headerShown: false }} />
      <Stack.Screen name="provider" options={{ headerShown: false }} />
      <Stack.Screen name="explore" options={{ title: "Explore" }} />
    </Stack>
  );
}