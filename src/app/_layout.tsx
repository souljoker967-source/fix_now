import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="login"
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="index"
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="customer"
        options={{ title: "Customer" }}
      />

      <Stack.Screen
        name="provider"
        options={{ title: "Service Provider" }}
      />

      <Stack.Screen
        name="explore"
        options={{ title: "Explore" }}
      />
    </Stack>
  );
}