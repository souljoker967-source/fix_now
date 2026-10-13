
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
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import API from "../api/api";

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
  const { userId } = useLocalSearchParams<{ userId: string }>();

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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={loadData} />
      }
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Fix Now</Text>
      <Text style={styles.subtitle}>Service Provider Dashboard</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {profile ? "My Service Profile" : "Register Your Service"}
        </Text>

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
        <Text style={styles.sectionTitle}>Customer Bookings</Text>
        <TouchableOpacity onPress={loadData}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator style={styles.loader} />}

      {!loading && bookings.length === 0 && (
        <Text style={styles.emptyText}>
          No booking requests yet. Save your service profile so customers can find you.
        </Text>
      )}

      {bookings.map((booking) => (
        <View key={booking.id} style={styles.card}>
          <Text style={styles.bookingTitle}>
            Booking #{booking.id} — {booking.status}
          </Text>
          <Text>Customer: {booking.customer_name}</Text>
          <Text>Phone: {booking.customer_phone}</Text>
          <Text>Problem: {booking.problem || "Not specified"}</Text>

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
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 22,
    paddingBottom: 40,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 34,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 24,
    color: "#111111",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    color: "#666666",
    marginVertical: 16,
  },
  section: {
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 12,
    padding: 16,
    marginBottom: 26,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#111111",
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: 14,
    marginBottom: 7,
    color: "#333333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cccccc",
    borderRadius: 10,
    padding: 13,
    fontSize: 16,
    color: "#111111",
  },
  primaryButton: {
    backgroundColor: "#111111",
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  secondaryButton: {
    backgroundColor: "#eef4ff",
    padding: 13,
    borderRadius: 10,
    marginTop: 16,
  },
  secondaryButtonText: {
    color: "#175cd3",
    textAlign: "center",
    fontWeight: "bold",
  },
  disabledButton: { opacity: 0.6 },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "bold",
    textAlign: "center",
  },
  locationInfo: {
    fontSize: 12,
    color: "#666666",
    marginTop: 8,
    lineHeight: 18,
  },
  availabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  bookingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  refreshText: { color: "#18794e", fontWeight: "bold" },
  loader: { marginVertical: 20 },
  emptyText: {
    color: "#666666",
    textAlign: "center",
    marginVertical: 20,
    lineHeight: 22,
  },
  card: {
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    gap: 8,
  },
  bookingTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111111",
    marginBottom: 5,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  actionButton: {
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  acceptButton: { flex: 1, backgroundColor: "#18794e" },
  rejectButton: { flex: 1, backgroundColor: "#b42318" },
  completeButton: { backgroundColor: "#175cd3" },
});
