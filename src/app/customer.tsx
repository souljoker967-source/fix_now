
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
  name: string;
  phone: string;
  service_type: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  is_available: boolean | number;
  distance_km?: number | null;
};

type Booking = {
  id: number;
  provider_id: number;
  provider_name: string;
  provider_phone: string;
  service_type: string;
  location: string | null;
  problem: string | null;
  status: string;
  created_at: string;
};

export default function CustomerScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();

  const [service, setService] = useState("");
  const [problem, setProblem] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [availableOnly, setAvailableOnly] = useState(true);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadBookings = useCallback(async () => {
    if (!userId) return;

    setHistoryLoading(true);
    try {
      const response = await API.get(
        `/bookings/customer/${encodeURIComponent(String(userId))}`
      );
      setBookings(response.data.bookings ?? []);
    } catch {
      Alert.alert("Booking history", "Unable to load bookings right now.");
    } finally {
      setHistoryLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadBookings();
    }, [loadBookings])
  );

  const captureLocation = async () => {
    setGettingLocation(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Location permission needed",
          "Allow location access in your phone settings, or enter your city/area to search without GPS."
        );
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLatitude(current.coords.latitude);
      setLongitude(current.coords.longitude);
      setManualLocation("");

      Alert.alert(
        "Location captured",
        "Your current GPS location is ready for nearby provider searches."
      );
    } catch {
      Alert.alert(
        "Unable to get location",
        "Turn on your phone's location service or search by city/area instead."
      );
    } finally {
      setGettingLocation(false);
    }
  };

  const findProviders = async () => {
    if (!service.trim()) {
      Alert.alert("Service required", "Enter a service, such as Plumber.");
      return;
    }

    if (latitude == null && !manualLocation.trim()) {
      Alert.alert(
        "Location required",
        "Use your current GPS location or enter a city/area."
      );
      return;
    }

    setLoading(true);
    setProviders([]);

    try {
      const params: Record<string, string | number | boolean> = {
        service: service.trim(),
        availableOnly,
      };

      if (latitude != null && longitude != null) {
        params.lat = latitude;
        params.lon = longitude;
        params.radiusKm = radiusKm;
      } else {
        params.location = manualLocation.trim();
      }

      const response = await API.get("/providers/search", { params });
      const results: Provider[] = response.data.providers ?? [];
      setProviders(results);

      if (results.length === 0) {
        Alert.alert(
          "No providers found",
          latitude != null
            ? `No matching providers were found within ${radiusKm} km. Try a larger radius or another service.`
            : "No matching providers were found for that area. Try another service or location."
        );
      }
    } catch (error: any) {
      Alert.alert(
        "Search failed",
        error?.response?.data?.message ??
          "Please check your internet connection and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const bookService = (provider: Provider) => {
    if (!userId || !/^\d+$/.test(String(userId))) {
      Alert.alert("Login required", "Please log in again before booking.");
      return;
    }

    const isAvailable =
      provider.is_available === true ||
      Number(provider.is_available) === 1;

    if (!isAvailable) {
      Alert.alert("Provider unavailable", "Choose an available provider.");
      return;
    }

    Alert.alert(
      "Confirm booking",
      `Request ${provider.service_type} service from ${provider.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setBookingId(provider.id);

            try {
              await API.post("/bookings", {
                customer_id: Number(userId),
                provider_id: provider.id,
                problem: problem.trim() || null,
              });

              Alert.alert("Booking created", "Your request is now Pending.");
              setProblem("");
              await loadBookings();
            } catch (error: any) {
              Alert.alert(
                "Booking failed",
                error?.response?.data?.message ??
                  "Could not save your booking. Please try again."
              );
            } finally {
              setBookingId(null);
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
        <RefreshControl
          refreshing={historyLoading}
          onRefresh={loadBookings}
        />
      }
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Fix Now</Text>
      <Text style={styles.subtitle}>Find a trusted service provider nearby</Text>

      <Text style={styles.label}>Service type</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Plumber, Electrician, Carpenter"
        value={service}
        onChangeText={setService}
        autoCapitalize="words"
      />

      <Text style={styles.label}>Describe your problem (optional)</Text>
      <TextInput
        style={[styles.input, styles.problemInput]}
        placeholder="Describe what needs fixing"
        value={problem}
        onChangeText={setProblem}
        multiline
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Search location</Text>

        <TouchableOpacity
          style={[styles.gpsButton, gettingLocation && styles.disabledButton]}
          onPress={captureLocation}
          disabled={gettingLocation}
        >
          <Text style={styles.gpsButtonText}>
            {gettingLocation ? "Getting GPS..." : "Use My Current GPS Location"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.locationInfo}>
          {latitude != null && longitude != null
            ? `GPS ready: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
            : "GPS not selected. Enter a city or area below."}
        </Text>

        <Text style={styles.label}>Or search by city/area</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Nagercoil, Kanyakumari"
          value={manualLocation}
          onChangeText={(value) => {
            setManualLocation(value);
            if (value.trim()) {
              setLatitude(null);
              setLongitude(null);
            }
          }}
          autoCapitalize="words"
        />

        {latitude != null && longitude != null && (
          <>
            <Text style={styles.label}>Search radius</Text>
            <View style={styles.radiusRow}>
              {[5, 10, 25].map((radius) => (
                <TouchableOpacity
                  key={radius}
                  style={[
                    styles.radiusButton,
                    radiusKm === radius && styles.radiusSelected,
                  ]}
                  onPress={() => setRadiusKm(radius)}
                >
                  <Text
                    style={[
                      styles.radiusText,
                      radiusKm === radius && styles.radiusSelectedText,
                    ]}
                  >
                    {radius} km
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={styles.availabilityRow}>
          <Text style={styles.availabilityLabel}>Available providers only</Text>
          <Switch
            value={availableOnly}
            onValueChange={setAvailableOnly}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.disabledButton]}
        onPress={findProviders}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Searching..." : "Find Service Providers"}
        </Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator style={styles.loader} />}

      {providers.map((provider) => {
        const isAvailable =
          provider.is_available === true ||
          Number(provider.is_available) === 1;

        return (
          <View key={provider.id} style={styles.card}>
            <Text style={styles.providerName}>{provider.name}</Text>
            <Text>Service: {provider.service_type}</Text>
            <Text>Location: {provider.location || "Not specified"}</Text>
            <Text>Phone: {provider.phone}</Text>

            {provider.distance_km != null && (
              <Text style={styles.distanceText}>
                Distance: {Number(provider.distance_km).toFixed(1)} km away
              </Text>
            )}

            <Text
              style={[
                styles.statusText,
                isAvailable ? styles.availableText : styles.unavailableText,
              ]}
            >
              {isAvailable ? "Available" : "Currently unavailable"}
            </Text>

            <TouchableOpacity
              style={[
                styles.bookButton,
                !isAvailable && styles.disabledButton,
              ]}
              disabled={!isAvailable || bookingId !== null}
              onPress={() => bookService(provider)}
            >
              <Text style={styles.buttonText}>
                {bookingId === provider.id
                  ? "Booking..."
                  : isAvailable
                    ? "Book Service"
                    : "Unavailable"}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={styles.historyHeader}>
        <Text style={styles.sectionTitle}>My Bookings</Text>
        <TouchableOpacity onPress={loadBookings}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {historyLoading && <ActivityIndicator />}

      {!historyLoading && bookings.length === 0 && (
        <Text style={styles.emptyText}>Your bookings will appear here.</Text>
      )}

      {bookings.map((booking) => (
        <View key={booking.id} style={styles.card}>
          <Text style={styles.providerName}>
            Booking #{booking.id} — {booking.status}
          </Text>
          <Text>Provider: {booking.provider_name}</Text>
          <Text>Service: {booking.service_type}</Text>
          <Text>Phone: {booking.provider_phone}</Text>
          <Text>Problem: {booking.problem || "Not specified"}</Text>
          <Text>Location: {booking.location || "Not specified"}</Text>
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
    marginBottom: 8,
    color: "#111111",
  },
  subtitle: {
    textAlign: "center",
    fontSize: 16,
    color: "#555555",
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 7,
    color: "#333333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cccccc",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 14,
    color: "#111111",
  },
  problemInput: {
    minHeight: 85,
    textAlignVertical: "top",
  },
  section: {
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 12,
    padding: 15,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#111111",
  },
  gpsButton: {
    backgroundColor: "#eef4ff",
    padding: 13,
    borderRadius: 10,
    marginTop: 14,
  },
  gpsButtonText: {
    color: "#175cd3",
    textAlign: "center",
    fontWeight: "bold",
  },
  locationInfo: {
    color: "#666666",
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  radiusRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  radiusButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cccccc",
    borderRadius: 9,
    padding: 12,
    alignItems: "center",
  },
  radiusSelected: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  radiusText: {
    color: "#333333",
    fontWeight: "600",
  },
  radiusSelectedText: {
    color: "#ffffff",
  },
  availabilityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  availabilityLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333333",
  },
  button: {
    backgroundColor: "#111111",
    padding: 16,
    borderRadius: 12,
    marginBottom: 18,
  },
  bookButton: {
    backgroundColor: "#18794e",
    padding: 14,
    borderRadius: 10,
    marginTop: 12,
  },
  buttonText: {
    color: "#ffffff",
    textAlign: "center",
    fontWeight: "bold",
    fontSize: 16,
  },
  disabledButton: { opacity: 0.5 },
  loader: { marginVertical: 15 },
  card: {
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 12,
    padding: 15,
    marginBottom: 14,
    gap: 6,
  },
  providerName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111111",
    marginBottom: 4,
  },
  distanceText: {
    color: "#175cd3",
    fontWeight: "600",
  },
  statusText: {
    fontWeight: "bold",
    marginTop: 4,
  },
  availableText: { color: "#18794e" },
  unavailableText: { color: "#b42318" },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 22,
    marginBottom: 14,
  },
  refreshText: {
    color: "#18794e",
    fontWeight: "bold",
  },
  emptyText: {
    color: "#666666",
    marginBottom: 20,
  },
});
