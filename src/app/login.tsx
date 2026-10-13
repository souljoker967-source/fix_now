import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import API from "../api/api";

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"customer" | "provider">(
    "customer"
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (
      !email.trim() ||
      !password ||
      (!isLogin && (!name.trim() || !phone.trim()))
    ) {
      Alert.alert("Missing details", "Please fill in all required fields.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }

    if (!isLogin && password.length < 8) {
      Alert.alert("Password too short", "Use at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const response = await API.post(
        isLogin ? "/login" : "/register",
        isLogin
          ? { email: email.trim().toLowerCase(), password }
          : {
              name: name.trim(),
              email: email.trim().toLowerCase(),
              phone: phone.trim(),
              password,
              account_type: accountType,
            }
      );

      const user = response.data.user;

      if (!user || user.id == null) {
        Alert.alert(
          "Account error",
          "The server did not return a valid user ID."
        );
        return;
      }

      const type = user.account_type ?? user.accountType ?? accountType;

      if (type === "provider") {
        router.replace({
          pathname: "/provider",
          params: {
            userId: String(user.id),
            accountType: "provider",
          },
        });
      } else {
        router.replace({
          pathname: "/customer",
          params: {
            userId: String(user.id),
            accountType: "customer",
          },
        });
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ??
        "Could not connect or authenticate. Please check your internet connection.";
      Alert.alert(isLogin ? "Login failed" : "Registration failed", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.logo}>Fix Now</Text>
        <Text style={styles.title}>
          {isLogin ? "Welcome back" : "Create your account"}
        </Text>
        <Text style={styles.subtitle}>
          {isLogin
            ? "Log in to continue"
            : "One account for all your home service needs"}
        </Text>

        {!isLogin && (
          <>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>I want to join as</Text>
            <View style={styles.typeRow}>
              {(["customer", "provider"] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeButton,
                    accountType === type && styles.selectedType,
                  ]}
                  onPress={() => setAccountType(type)}
                >
                  <Text
                    style={[
                      styles.typeText,
                      accountType === type && styles.selectedTypeText,
                    ]}
                  >
                    {type === "customer" ? "Customer" : "Service Provider"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="At least 8 characters"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitText}>
            {loading
              ? "Please wait..."
              : isLogin
                ? "Log In"
                : "Create Account"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setIsLogin(!isLogin)}
          disabled={loading}
        >
          <Text style={styles.switchText}>
            {isLogin
              ? "New here? Create an account"
              : "Already have an account? Log in"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 26,
    paddingVertical: 35,
  },
  logo: {
    color: "#111111",
    fontSize: 40,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 27,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: "#666666",
    textAlign: "center",
    marginBottom: 30,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
    color: "#222222",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cccccc",
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 18,
    color: "#111111",
  },
  typeRow: { flexDirection: "row", gap: 10, marginBottom: 22 },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cccccc",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  selectedType: { backgroundColor: "#111111", borderColor: "#111111" },
  typeText: { fontSize: 14, fontWeight: "600", color: "#222222" },
  selectedTypeText: { color: "#ffffff" },
  submitButton: {
    backgroundColor: "#111111",
    borderRadius: 12,
    padding: 17,
    alignItems: "center",
    marginTop: 5,
  },
  disabledButton: { opacity: 0.6 },
  submitText: { color: "#ffffff", fontSize: 17, fontWeight: "bold" },
  switchButton: { padding: 18, alignItems: "center" },
  switchText: {
    color: "#333333",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
});