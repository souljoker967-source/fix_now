
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import API from "../api/api";
import { useSession } from "../auth/session";
import AppColors from "../constants/app-theme";

type Provider = {
  id: number;
  user_id: number;
  name: string;
  phone: string;
  service_type: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  is_available: boolean | number;
};

type Booking = {
  id: number;
  customer_id: number;
  provider_id: number;
  customer_name: string;
  customer_phone: string;
  problem: string | null;
  status: string;
  created_at: string;
};

export default function ProviderScreen() {
  const { user, signOut } = useSession();
  const userId = user ? String(user.id) : null;

  const [profile, setProfile] = useState<Provider | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [available, setAvailable] = useState(true);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      const [profileResponse, bookingsResponse] = await Promise.all([
        API.get(`/providers/by-user/${encodeURIComponent(String(userId))}`),
        API.get(`/bookings/provider/${encodeURIComponent(String(userId))}`),
      ]);

      const saved = profileResponse.data.provider ?? null;
      setProfile(saved);

      if (saved) {
        setName(saved.name ?? "");
        setPhone(saved.phone ?? "");
        setServiceType(saved.service_type ?? "");
        setLocation(saved.location ?? "");
        setLatitude(saved.latitude == null ? null : Number(saved.latitude));
        setLongitude(saved.longitude == null ? null : Number(saved.longitude));
        setAvailable(
          saved.is_available === true ||
            Number(saved.is_available) === 1
        );
      }

      setBookings(bookingsResponse.data.bookings ?? []);
    } catch (error: any) {
      Alert.alert(
        "Unable to load information",
        error?.response?.data?.message ??
          "Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const captureLocation = async () => {
    setGettingLocation(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Location permission needed",
          "Allow location access in your phone settings to save your service location."
        );
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLatitude(current.coords.latitude);
      setLongitude(current.coords.longitude);

      Alert.alert(
        "Location captured",
        "GPS coordinates are ready. Save your profile to make your service searchable nearby."
      );
    } catch {
      Alert.alert(
        "Unable to get location",
        "Check that your phone's location service is enabled and try again."
      );
    } finally {
      setGettingLocation(false);
    }
  };

  const saveProfile = async () => {
    if (!userId || !/^\d+$/.test(String(userId))) {
      Alert.alert("Login required", "Please log in again.");
      return;
    }

    if (!name.trim() || !phone.trim() || !serviceType.trim() || !location.trim()) {
      Alert.alert(
        "Missing details",
        "Enter your name, phone number, service type, and city or area."
      );
      return;
    }

    setSaving(true);

    try {
      const response = await API.post("/providers", {
        user_id: Number(userId),
        name: name.trim(),
        phone: phone.trim(),
        service_type: serviceType.trim(),
        location: location.trim(),
        latitude,
        longitude,
        is_available: available,
      });

      setProfile({
        id: response.data.providerId,
        user_id: Number(userId),
        name: name.trim(),
        phone: phone.trim(),
        service_type: serviceType.trim(),
        location: location.trim(),
        latitude,
        longitude,
        is_available: available,
      });

      Alert.alert("Profile saved", "Your service profile has been saved.");
      await loadData();
    } catch (error: any) {
      Alert.alert(
        "Save failed",
        error?.response?.data?.message ??
          "Unable to save your profile. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const changeAvailability = async (value: boolean) => {
    if (!profile) {
      setAvailable(value);
      Alert.alert(
        "Save your profile",
        "Register your service profile first. Your availability will be saved with it."
      );
      return;
    }

    setAvailable(value);

    try {
      await API.patch(`/providers/${profile.id}/availability`, {
        user_id: Number(userId),
        is_available: value,
      });

      setProfile({ ...profile, is_available: value });
    } catch (error: any) {
      setAvailable(!value);
      Alert.alert(
        "Availability update failed",
        error?.response?.data?.message ?? "Please try again."
      );
    }
  };

  const updateStatus = (booking: Booking, status: string) => {
    if (!profile) {
      Alert.alert("Profile required", "Save your provider profile first.");
      return;
    }

    Alert.alert(
      "Confirm status",
      `Mark booking #${booking.id} as ${status.toLowerCase()}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setUpdatingId(booking.id);

            try {
              await API.patch(`/bookings/${booking.id}/status`, {
                status,
                provider_id: profile.id,
              });

              Alert.alert(
                "Booking updated",
                `Booking ${status.toLowerCase()} successfully.`
              );
              await loadData();
            } catch (error: any) {
              Alert.alert(
                "Update failed",
                error?.response?.data?.message ??
                  "Unable to update this booking."
              );
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      Alert.alert("Sign out failed", error.message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadData} />
        }
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.header}>
        <View style={styles.brandLockup}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>F</Text>
          </View>
          <Text style={styles.brandName}>
            Fix<Text style={styles.brandAccent}>Now</Text>
          </Text>
        </View>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>PROVIDER</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={handleSignOut}
          style={styles.signOutButton}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.eyebrow}>YOUR PROFESSIONAL WORKSPACE</Text>
      <Text style={styles.title}>
        {profile?.name ? `Welcome, ${profile.name.split(" ")[0]}` : "Grow your service"}
      </Text>
      <Text style={styles.subtitle}>
        Manage your profile and respond to customer requests.
      </Text>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>
            {bookings.filter((booking) => booking.status === "Pending").length}
          </Text>
          <Text style={styles.metricLabel}>Open requests</Text>
        </View>
        <View style={styles.metricCard}>
          <Text
            style={[
              styles.metricStatus,
              profile ? styles.metricLive : styles.metricDraft,
            ]}
          >
            {profile ? "LIVE" : "SETUP"}
          </Text>
          <Text style={styles.metricLabel}>Service profile</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIcon}>
            <Text style={styles.sectionIconText}>✦</Text>
          </View>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.sectionTitle}>
              {profile ? "Service profile" : "Set up your profile"}
            </Text>
            <Text style={styles.sectionSubtitle}>
              Help nearby customers find and book you
            </Text>
          </View>
        </View>

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

        <Text style={styles.label}>Service type</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Plumber, Electrician, Carpenter"
          value={serviceType}
          onChangeText={setServiceType}
          autoCapitalize="words"
        />

        <Text style={styles.label}>City or area</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Nagercoil, Chennai"
          value={location}
          onChangeText={setLocation}
          autoCapitalize="words"
        />

        <TouchableOpacity
          style={[styles.secondaryButton, gettingLocation && styles.disabledButton]}
          onPress={captureLocation}
          disabled={gettingLocation}
        >
          <Text style={styles.secondaryButtonText}>
            {gettingLocation
              ? "Getting GPS location..."
              : latitude != null && longitude != null
                ? "Update GPS Location"
                : "Use My Current GPS Location"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.locationInfo}>
          {latitude != null && longitude != null
            ? `GPS saved in form: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
            : "GPS not captured. Nearby search will not include your profile until you add GPS coordinates."}
        </Text>

        <View style={styles.availabilityRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Accepting new bookings</Text>
            <Text style={styles.locationInfo}>
              {available ? "Available to customers" : "Hidden from available-only search"}
            </Text>
          </View>
          <Switch value={available} onValueChange={changeAvailability} />
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.disabledButton]}
          onPress={saveProfile}
          disabled={saving}
        >
          <Text style={styles.buttonText}>
            {saving
              ? "Saving..."
              : profile
                ? "Update Service Profile"
                : "Register My Service"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bookingHeader}>
        <View>
          <Text style={styles.sectionTitle}>Customer requests</Text>
          <Text style={styles.sectionSubtitle}>Review and update job status</Text>
        </View>
        <TouchableOpacity onPress={loadData}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator style={styles.loader} />}

      {!loading && bookings.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>▣</Text>
          <Text style={styles.emptyText}>
          No booking requests yet. Save your service profile so customers can find you.
          </Text>
        </View>
      )}

      {bookings.map((booking) => (
        <View key={booking.id} style={styles.card}>
          <View style={styles.bookingTopRow}>
            <Text style={styles.bookingId}>REQUEST #{booking.id}</Text>
            <View
              style={[
                styles.statusPill,
                booking.status === "Pending"
                  ? styles.pendingPill
                  : booking.status === "Rejected"
                    ? styles.rejectedPill
                    : styles.acceptedPill,
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  booking.status === "Pending"
                    ? styles.pendingText
                    : booking.status === "Rejected"
                      ? styles.rejectedText
                      : styles.acceptedText,
                ]}
              >
                {booking.status}
              </Text>
            </View>
          </View>
          <Text style={styles.customerName}>{booking.customer_name}</Text>
          <Text style={styles.bookingDetail}>☎  {booking.customer_phone}</Text>
          <Text style={styles.bookingDetail}>
            {booking.problem || "No problem details provided"}
          </Text>

          {booking.status === "Pending" && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton]}
                disabled={updatingId !== null}
                onPress={() => updateStatus(booking, "Accepted")}
              >
                <Text style={styles.buttonText}>
                  {updatingId === booking.id ? "Updating..." : "Accept"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                disabled={updatingId !== null}
                onPress={() => updateStatus(booking, "Rejected")}
              >
                <Text style={styles.buttonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          )}

          {booking.status === "Accepted" && (
            <TouchableOpacity
              style={[styles.actionButton, styles.completeButton]}
              disabled={updatingId !== null}
              onPress={() => updateStatus(booking, "Completed")}
            >
              <Text style={styles.buttonText}>
                {updatingId === booking.id ? "Updating..." : "Mark Completed"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: AppColors.background },
  container: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 36,
    backgroundColor: AppColors.background,
  },
  header: {
    minHeight: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 25,
  },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: AppColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: { color: AppColors.surface, fontSize: 19, fontWeight: "900" },
  brandName: { color: AppColors.text, fontSize: 20, fontWeight: "800" },
  brandAccent: { color: AppColors.primary },
  rolePill: {
    backgroundColor: AppColors.primarySoft,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  rolePillText: {
    color: AppColors.primary,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  signOutButton: { paddingHorizontal: 8, paddingVertical: 10 },
  signOutText: { color: AppColors.muted, fontSize: 12, fontWeight: "700" },
  eyebrow: {
    color: AppColors.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 7,
  },
  title: {
    color: AppColors.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: AppColors.muted,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 18,
  },
  metricsRow: { flexDirection: "row", gap: 11, marginBottom: 20 },
  metricCard: {
    flex: 1,
    minHeight: 84,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 16,
    padding: 14,
    justifyContent: "center",
  },
  metricValue: { color: AppColors.text, fontSize: 23, fontWeight: "800" },
  metricStatus: { fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
  metricLive: { color: AppColors.success },
  metricDraft: { color: AppColors.warning },
  metricLabel: { color: AppColors.muted, fontSize: 11, marginTop: 4 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 17,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: AppColors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionIconText: { color: AppColors.primary, fontSize: 19 },
  sectionHeadingCopy: { flex: 1, marginLeft: 11 },
  sectionSubtitle: { color: AppColors.muted, fontSize: 11, marginTop: 4 },
  section: {
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 19,
    padding: 16,
    marginBottom: 26,
    backgroundColor: AppColors.surface,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: AppColors.text,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
    color: AppColors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14,
    color: AppColors.text,
    backgroundColor: "#FCFDFF",
  },
  primaryButton: {
    backgroundColor: AppColors.primary,
    minHeight: 48,
    paddingHorizontal: 15,
    borderRadius: 13,
    justifyContent: "center",
    marginTop: 17,
  },
  secondaryButton: {
    backgroundColor: AppColors.primarySoft,
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 14,
  },
  secondaryButtonText: {
    color: AppColors.primary,
    textAlign: "center",
    fontWeight: "800",
    fontSize: 12,
  },
  disabledButton: { opacity: 0.6 },
  buttonText: {
    color: AppColors.surface,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  locationInfo: {
    fontSize: 11,
    color: AppColors.muted,
    marginTop: 8,
    lineHeight: 17,
  },
  availabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  bookingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 13,
  },
  refreshText: { color: AppColors.primary, fontWeight: "800", fontSize: 12 },
  loader: { marginVertical: 18 },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 16,
    padding: 15,
    marginBottom: 14,
  },
  emptyIcon: { color: AppColors.primary, fontSize: 22, marginRight: 12 },
  emptyText: {
    flex: 1,
    color: AppColors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  card: {
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 17,
    padding: 15,
    marginBottom: 12,
    gap: 7,
  },
  bookingTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  bookingId: { color: AppColors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  pendingPill: { backgroundColor: AppColors.warningSoft },
  acceptedPill: { backgroundColor: AppColors.successSoft },
  rejectedPill: { backgroundColor: AppColors.dangerSoft },
  statusPillText: { fontSize: 10, fontWeight: "800" },
  pendingText: { color: AppColors.warning },
  acceptedText: { color: AppColors.success },
  rejectedText: { color: AppColors.danger },
  customerName: { color: AppColors.text, fontSize: 15, fontWeight: "800" },
  bookingDetail: { color: AppColors.muted, fontSize: 12, lineHeight: 17 },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  actionButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  acceptButton: { flex: 1, backgroundColor: AppColors.success },
  rejectButton: { flex: 1, backgroundColor: AppColors.danger },
  completeButton: { backgroundColor: AppColors.primary },
});
