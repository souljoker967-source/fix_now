import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../auth/session";
import AppColors from "../constants/app-theme";

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
  const [formError, setFormError] = useState<string | null>(null);
  const { signIn, register, error: sessionError, clearError } = useSession();

  async function handleSubmit() {
    setFormError(null);
    clearError();
    if (
      !email.trim() ||
      !password ||
      (!isLogin && (!name.trim() || !phone.trim()))
    ) {
      setFormError("Please fill in all required fields.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError("Please enter a valid email address.");
      return;
    }

    if (!isLogin && password.length < 8) {
      setFormError("Use a password with at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const user = isLogin
        ? await signIn(email.trim().toLowerCase(), password)
        : await register({
              name: name.trim(),
              email: email.trim().toLowerCase(),
              phone: phone.trim(),
              password,
              account_type: accountType,
            });
      if (user.account_type !== "customer" && user.account_type !== "provider") {
        throw new Error("The account has an unsupported role.");
      }
    } catch (error: any) {
      setFormError(
        error?.response?.data?.message ??
          error?.message ??
          "Could not connect or authenticate. Please check your internet connection."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.brandLockup}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>F</Text>
          </View>
          <Text style={styles.logo}>
            Fix<Text style={styles.logoAccent}>Now</Text>
          </Text>
        </View>
        <Text style={styles.title}>
          {isLogin ? "Welcome back" : "Create your account"}
        </Text>
        <Text style={styles.subtitle}>
          {isLogin
            ? "Log in to continue"
            : "One account for all your home service needs"}
        </Text>
        {(formError || sessionError) && (
          <Text accessibilityRole="alert" style={styles.errorMessage}>
            {formError || sessionError}
          </Text>
        )}

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
                  accessibilityRole="button"
                  accessibilityState={{ selected: accountType === type }}
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
                  <Text
                    style={[
                      styles.typeDescription,
                      accountType === type && styles.selectedTypeDescription,
                    ]}
                  >
                    {type === "customer"
                      ? "Book trusted local help"
                      : "Offer your professional services"}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: AppColors.background },
  screen: { flex: 1, backgroundColor: AppColors.background },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  brandLockup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 30,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: AppColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: { color: AppColors.surface, fontSize: 22, fontWeight: "900" },
  logoAccent: { color: AppColors.primary },
  logo: {
    color: AppColors.text,
    fontSize: 27,
    fontWeight: "800",
  },
  title: {
    color: AppColors.text,
    fontSize: 29,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: AppColors.muted,
    lineHeight: 21,
    marginBottom: 27,
  },
  errorMessage: {
    color: AppColors.danger,
    backgroundColor: "#FFF1F0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    color: AppColors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 18,
    color: AppColors.text,
    backgroundColor: AppColors.surface,
  },
  typeRow: { flexDirection: "row", gap: 10, marginBottom: 22 },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 15,
    paddingVertical: 13,
    paddingHorizontal: 12,
    minHeight: 80,
    justifyContent: "center",
    backgroundColor: AppColors.surface,
  },
  selectedType: {
    backgroundColor: AppColors.primarySoft,
    borderColor: AppColors.primary,
  },
  typeText: { fontSize: 13, fontWeight: "800", color: AppColors.text },
  selectedTypeText: { color: AppColors.primaryDark },
  typeDescription: {
    color: AppColors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 5,
  },
  selectedTypeDescription: { color: AppColors.primaryDark },
  submitButton: {
    backgroundColor: AppColors.primary,
    borderRadius: 14,
    minHeight: 52,
    paddingHorizontal: 17,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },
  disabledButton: { opacity: 0.6 },
  submitText: { color: AppColors.surface, fontSize: 15, fontWeight: "800" },
  switchButton: { padding: 18, alignItems: "center" },
  switchText: {
    color: AppColors.primary,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
});