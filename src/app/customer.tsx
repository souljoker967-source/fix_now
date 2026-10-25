
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import API from "../api/api";
import { useSession } from "../auth/session";
import AppColors from "../constants/app-theme";

const serviceCategories = [
  { label: "Plumbing", icon: "🚰" },
  { label: "Electrical", icon: "💡" },
  { label: "Cleaning", icon: "✨" },
  { label: "Carpentry", icon: "🪚" },
  { label: "Painting", icon: "🎨" },
  { label: "Appliances", searchTerm: "Appliance Repair", icon: "🔧" },
];

type Provider = {
  id: number | string;
  name: string;
  phone: string;
  service_type: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  is_available: boolean | number;
  distance_km?: number | null;
  is_demo?: boolean;
  starting_price_inr?: number | null;
  experience_years?: number | null;
  demo_rating?: number | null;
  description?: string | null;
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
  const { user, signOut } = useSession();
  const userId = user ? String(user.id) : null;

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
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const searchInFlight = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const serviceInputRef = useRef<TextInput>(null);
  const searchSectionY = useRef(0);
  const bookingsSectionY = useRef(0);

  const goToSearch = () => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, searchSectionY.current - 20),
      animated: true,
    });
    serviceInputRef.current?.focus();
  };

  const goToBookings = () => {
    scrollRef.current?.scrollTo({
      y: Math.max(0, bookingsSectionY.current - 12),
      animated: true,
    });
  };

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
    if (searchInFlight.current) return;
    setSearchError(null);
    if (!service.trim()) {
      setSearchError("Enter a service, such as Plumber.");
      return;
    }

    if (latitude == null && !manualLocation.trim()) {
      setSearchError("Use your current GPS location or enter a city or area.");
      return;
    }

    searchInFlight.current = true;
    setLoading(true);
    setHasSearched(false);
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
      setHasSearched(true);
    } catch (error: any) {
      setSearchError(
        error?.response?.data?.message ??
          "Please check your internet connection and try again."
      );
    } finally {
      searchInFlight.current = false;
      setLoading(false);
    }
  };

  const bookService = (provider: Provider) => {
    if (provider.is_demo || typeof provider.id !== "number") {
      Alert.alert(
        "Demo profile",
        "This fictional profile is for demonstration only and cannot be booked."
      );
      return;
    }
    const providerId = provider.id;

    if (!userId) {
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
            setBookingId(providerId);

            try {
              await API.post("/bookings", {
                customer_id: Number(userId),
                provider_id: providerId,
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

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      Alert.alert("Sign out failed", error.message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.screen}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          refreshControl={
            <RefreshControl refreshing={historyLoading} onRefresh={loadBookings} />
          }
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.brand}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>F</Text>
              </View>
              <Text style={styles.brandName}>
                Fix<Text style={styles.brandAccent}>Now</Text>
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set your search location using GPS"
              style={styles.locationPill}
              onPress={captureLocation}
              disabled={gettingLocation}
            >
              <Text style={styles.locationPin}>⌖</Text>
              <Text style={styles.locationPillText}>
                {latitude != null ? "Nearby" : "Set location"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={styles.signOutButton}
              onPress={handleSignOut}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>

          <View style={styles.welcome}>
            <Text style={styles.eyebrow}>HOME SERVICES, MADE SIMPLE</Text>
            <Text style={styles.welcomeTitle}>What can we fix today?</Text>
            <Text style={styles.welcomeCopy}>
              Find trusted local professionals for the jobs that matter.
            </Text>
          </View>

          <View
            style={styles.searchCard}
            onLayout={(event) => {
              searchSectionY.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.searchLabel}>Find a service</Text>
            <View style={styles.searchRow}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                ref={serviceInputRef}
                style={styles.searchInput}
                placeholder="Plumbing, cleaning, repairs..."
                placeholderTextColor={AppColors.muted}
                value={service}
                onChangeText={setService}
                autoCapitalize="words"
                returnKeyType="search"
                onSubmitEditing={findProviders}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Search for service providers"
                style={[styles.searchButton, loading && styles.disabledButton]}
                onPress={findProviders}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={AppColors.surface} size="small" />
                ) : (
                  <Text style={styles.searchButtonText}>Go</Text>
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.activityCard}>
            <View style={styles.activityIcon}>
              <Text style={styles.activityIconText}>▣</Text>
            </View>
            <View style={styles.activityCopy}>
              <Text style={styles.activityTitle}>
                {bookings.length
                  ? `${bookings.length} booking${bookings.length === 1 ? "" : "s"}`
                  : "Your bookings"}
              </Text>
              <Text style={styles.activitySubtitle}>
                {bookings.length
                  ? `${bookings.filter((booking) => booking.status === "Pending").length} requests awaiting updates`
                  : "Track your service requests here"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View your bookings"
              onPress={goToBookings}
              style={styles.activityAction}
            >
              <Text style={styles.activityActionText}>View</Text>
            </Pressable>
          </View>

          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>Explore services</Text>
              <Text style={styles.sectionSubtitle}>What do you need help with?</Text>
            </View>
            <Text style={styles.sectionDecoration}>✦</Text>
          </View>

          <View style={styles.categoryGrid}>
            {serviceCategories.map((category, index) => (
              <Pressable
                key={category.label}
                accessibilityRole="button"
                accessibilityLabel={`Search ${category.label}`}
                style={styles.categoryCard}
                onPress={() => {
                  setService(category.searchTerm ?? category.label);
                  goToSearch();
                }}
              >
                <View
                  style={[
                    styles.categoryIcon,
                    index % 3 === 1 && styles.categoryIconBlue,
                    index % 3 === 2 && styles.categoryIconLilac,
                  ]}
                >
                  <Text style={styles.categoryEmoji}>{category.icon}</Text>
                </View>
                <Text style={styles.categoryName}>{category.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.locationCard}>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionTitle}>Your location</Text>
                <Text style={styles.sectionSubtitle}>
                  Search nearby or enter a city
                </Text>
              </View>
              <Text style={styles.locationCardIcon}>⌖</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              style={[
                styles.gpsButton,
                gettingLocation && styles.disabledButton,
              ]}
              onPress={captureLocation}
              disabled={gettingLocation}
            >
              {gettingLocation ? (
                <ActivityIndicator color={AppColors.primary} size="small" />
              ) : (
                <Text style={styles.gpsButtonIcon}>◎</Text>
              )}
              <Text style={styles.gpsButtonText}>
                {gettingLocation ? "Getting your location..." : "Use my current location"}
              </Text>
            </Pressable>
            <Text style={styles.locationInfo}>
              {latitude != null && longitude != null
                ? `GPS ready · ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                : "Your location is only used to find nearby providers."}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Or enter a city or area"
              placeholderTextColor={AppColors.muted}
              value={manualLocation}
              onChangeText={(value) => {
                setManualLocation(value);
                if (value.trim()) {
                  setLatitude(null);
                  setLongitude(null);
                }
              }}
              autoCapitalize="words"
              returnKeyType="done"
            />

            {latitude != null && longitude != null && (
              <View style={styles.radiusRow}>
                <Text style={styles.availabilityLabel}>Search radius</Text>
                {[5, 10, 25].map((radius) => (
                  <Pressable
                    key={radius}
                    accessibilityRole="button"
                    accessibilityState={{ selected: radiusKm === radius }}
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
                  </Pressable>
                ))}
              </View>
            )}

            <View style={styles.availabilityRow}>
              <View style={styles.availabilityCopy}>
                <Text style={styles.availabilityLabel}>Available providers only</Text>
                <Text style={styles.locationInfo}>Hide providers who are busy</Text>
              </View>
              <Switch
                value={availableOnly}
                onValueChange={setAvailableOnly}
                trackColor={{ false: AppColors.border, true: "#BFDBFE" }}
                thumbColor={availableOnly ? AppColors.primary : "#F8FAFC"}
              />
            </View>

            <Text style={styles.fieldLabel}>Add a note (optional)</Text>
            <TextInput
              style={[styles.input, styles.problemInput]}
              placeholder="Tell the professional what needs fixing"
              placeholderTextColor={AppColors.muted}
              value={problem}
              onChangeText={setProblem}
              multiline
            />
            <Pressable
              accessibilityRole="button"
              style={[styles.findButton, loading && styles.disabledButton]}
              onPress={findProviders}
              disabled={loading}
            >
              <Text style={styles.findButtonText}>
                {loading ? "Searching..." : "Find professionals"}
              </Text>
              {!loading && <Text style={styles.findButtonArrow}>→</Text>}
            </Pressable>
            {searchError && (
              <Text accessibilityRole="alert" style={styles.searchError}>
                {searchError}
              </Text>
            )}
          </View>

          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.sectionTitle}>
                {providers.length ? "Matching professionals" : "Local professionals"}
              </Text>
              <Text style={styles.sectionSubtitle}>
                {providers.length
                  ? `${providers.length} result${providers.length === 1 ? "" : "s"} from your search`
                  : "Real providers appear here after you search"}
              </Text>
            </View>
            {providers.length > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={goToSearch}
                hitSlop={8}
              >
                <Text style={styles.linkText}>Edit search</Text>
              </Pressable>
            )}
          </View>

          {loading && <ActivityIndicator style={styles.loader} color={AppColors.primary} />}

          {!loading && providers.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>⌕</Text>
              <Text style={styles.emptyTitle}>
                {hasSearched ? "No matching providers found" : "Your next great local pro"}
              </Text>
              <Text style={styles.emptyText}>
                {hasSearched
                  ? latitude != null
                    ? `No matching providers were found within ${radiusKm} km. Try a larger radius or another service.`
                    : "No matching providers were found for that area. Try another service or location."
                  : "Choose a service and location to see available professionals."}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={goToSearch}
                style={styles.emptyLink}
              >
                <Text style={styles.emptyLinkText}>Start a search →</Text>
              </Pressable>
            </View>
          )}

          {providers.map((provider) => {
            const isAvailable =
              provider.is_available === true ||
              Number(provider.is_available) === 1;

            return (
              <View key={provider.id} style={styles.providerCard}>
                <View style={styles.providerTopRow}>
                  <View style={styles.providerAvatar}>
                    <Text style={styles.providerAvatarText}>
                      {provider.name.trim().charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.providerDetails}>
                    <Text style={styles.providerName}>{provider.name}</Text>
                    {provider.is_demo && (
                      <Text style={styles.demoBadge}>DEMO PROFILE</Text>
                    )}
                    <Text style={styles.providerService}>{provider.service_type}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      isAvailable ? styles.availablePill : styles.unavailablePill,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        isAvailable
                          ? styles.availableText
                          : styles.unavailableText,
                      ]}
                    >
                      {isAvailable ? "Available" : "Busy"}
                    </Text>
                  </View>
                </View>
                <View style={styles.providerMetaRow}>
                  <Text style={styles.providerMeta}>⌖ {provider.location || "Location not listed"}</Text>
                  {provider.distance_km != null && (
                    <Text style={styles.distanceText}>
                      {Number(provider.distance_km).toFixed(1)} km away
                    </Text>
                  )}
                </View>
                {provider.is_demo && (
                  <View style={styles.demoDetails}>
                    <Text style={styles.demoDetailText}>
                      Illustrative ₹{provider.starting_price_inr} start · {provider.experience_years} years’ experience · Demo rating {provider.demo_rating} ★
                    </Text>
                    {!!provider.description && (
                      <Text style={styles.demoDescription}>
                        {provider.description}
                      </Text>
                    )}
                    <Text style={styles.demoDisclaimer}>
                      Fictional, not verified · no real contact · demo only
                    </Text>
                  </View>
                )}
                <View style={styles.providerFooter}>
                  <Text style={styles.providerPhone}>
                    {provider.is_demo ? "DEMO ONLY — no contact" : provider.phone}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    style={[
                      styles.bookButton,
                      (provider.is_demo || !isAvailable || bookingId !== null) &&
                        styles.disabledButton,
                    ]}
                    disabled={provider.is_demo || !isAvailable || bookingId !== null}
                    onPress={() => bookService(provider)}
                  >
                    <Text style={styles.bookButtonText}>
                      {bookingId === provider.id
                        ? "Booking..."
                        : provider.is_demo
                          ? "Demo only"
                        : isAvailable
                          ? "Book now"
                          : "Unavailable"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          <View
            style={styles.historyHeader}
            onLayout={(event) => {
              bookingsSectionY.current = event.nativeEvent.layout.y;
            }}
          >
            <View>
              <Text style={styles.sectionTitle}>My bookings</Text>
              <Text style={styles.sectionSubtitle}>Requests and service status</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={loadBookings}
              hitSlop={8}
            >
              <Text style={styles.linkText}>Refresh</Text>
            </Pressable>
          </View>

          {historyLoading && (
            <ActivityIndicator style={styles.loader} color={AppColors.primary} />
          )}

          {!historyLoading && bookings.length === 0 && (
            <View style={styles.emptyBookingCard}>
              <Text style={styles.emptyBookingIcon}>▣</Text>
              <View style={styles.emptyBookingCopy}>
                <Text style={styles.emptyBookingTitle}>No bookings yet</Text>
                <Text style={styles.emptyBookingText}>
                  When you book a service, its progress will show here.
                </Text>
              </View>
            </View>
          )}

          {bookings.map((booking) => {
            const statusColor =
              booking.status === "Accepted" || booking.status === "Completed"
                ? AppColors.success
                : booking.status === "Rejected"
                  ? AppColors.danger
                  : AppColors.warning;
            const statusBackground =
              booking.status === "Accepted" || booking.status === "Completed"
                ? AppColors.successSoft
                : booking.status === "Rejected"
                  ? AppColors.dangerSoft
                  : AppColors.warningSoft;

            return (
              <View key={booking.id} style={styles.bookingCard}>
                <View style={styles.bookingTopRow}>
                  <Text style={styles.bookingId}>Request #{booking.id}</Text>
                  <View
                    style={[
                      styles.bookingStatusPill,
                      { backgroundColor: statusBackground },
                    ]}
                  >
                    <Text style={[styles.bookingStatusText, { color: statusColor }]}>
                      {booking.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.bookingService}>{booking.service_type}</Text>
                <Text style={styles.bookingProvider}>
                  {booking.provider_name} · {booking.location || "Location not listed"}
                </Text>
                {booking.problem ? (
                  <Text style={styles.bookingProblem}>{booking.problem}</Text>
                ) : null}
                <Text style={styles.bookingPhone}>{booking.provider_phone}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.bottomNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: true }}
            onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
            style={styles.navItem}
          >
            <Text style={[styles.navIcon, styles.navActive]}>⌂</Text>
            <Text style={[styles.navLabel, styles.navActive]}>Home</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={goToSearch}
            style={styles.navItem}
          >
            <Text style={styles.navIcon}>⌕</Text>
            <Text style={styles.navLabel}>Find</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={goToBookings}
            style={styles.navItem}
          >
            <Text style={styles.navIcon}>▣</Text>
            <Text style={styles.navLabel}>Bookings</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: AppColors.surface },
  screen: { flex: 1, backgroundColor: AppColors.background },
  container: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 26,
  },
  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 26,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: AppColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: { color: AppColors.surface, fontSize: 21, fontWeight: "900" },
  brandName: { color: AppColors.text, fontSize: 21, fontWeight: "800" },
  brandAccent: { color: AppColors.primary },
  locationPill: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: AppColors.surface,
    borderColor: AppColors.border,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
  },
  locationPin: { color: AppColors.primary, fontSize: 18, fontWeight: "700" },
  locationPillText: { color: AppColors.text, fontSize: 12, fontWeight: "700" },
  signOutButton: { paddingHorizontal: 8, paddingVertical: 10 },
  signOutText: { color: AppColors.muted, fontSize: 12, fontWeight: "700" },
  welcome: { marginBottom: 20 },
  eyebrow: {
    color: AppColors.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  welcomeTitle: {
    color: AppColors.text,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  welcomeCopy: {
    color: AppColors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
  },
  searchCard: {
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
  },
  searchLabel: {
    color: AppColors.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
    marginLeft: 2,
  },
  searchRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F9FC",
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 5,
  },
  searchIcon: { color: AppColors.primary, fontSize: 26, marginRight: 8 },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: AppColors.text,
    fontSize: 14,
    paddingVertical: 12,
  },
  searchButton: {
    width: 46,
    height: 44,
    backgroundColor: AppColors.primary,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonText: { color: AppColors.surface, fontSize: 14, fontWeight: "800" },
  activityCard: {
    minHeight: 78,
    backgroundColor: AppColors.primarySoft,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
  },
  activityIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: AppColors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  activityIconText: { color: AppColors.primary, fontSize: 21 },
  activityCopy: { flex: 1, marginLeft: 11 },
  activityTitle: { color: AppColors.text, fontSize: 14, fontWeight: "800" },
  activitySubtitle: { color: AppColors.muted, fontSize: 11, marginTop: 3 },
  activityAction: {
    borderWidth: 1,
    borderColor: "#C8DAFF",
    backgroundColor: AppColors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activityActionText: { color: AppColors.primary, fontSize: 12, fontWeight: "800" },
  sectionHeading: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: { color: AppColors.text, fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { color: AppColors.muted, fontSize: 12, marginTop: 4 },
  sectionDecoration: { color: "#F59E0B", fontSize: 21 },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 28,
    rowGap: 10,
  },
  categoryCard: {
    width: "31.7%",
    minHeight: 110,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppColors.surface,
    borderColor: AppColors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 10,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#FFF5E8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  categoryIconBlue: { backgroundColor: "#EAF2FF" },
  categoryIconLilac: { backgroundColor: "#F3EDFF" },
  categoryEmoji: { fontSize: 23 },
  categoryName: {
    color: AppColors.text,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  locationCard: {
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 20,
    padding: 16,
    marginBottom: 28,
  },
  locationCardIcon: { color: AppColors.primary, fontSize: 23 },
  gpsButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: AppColors.primarySoft,
    borderRadius: 13,
    marginTop: 5,
  },
  gpsButtonIcon: { color: AppColors.primary, fontSize: 20, fontWeight: "700" },
  gpsButtonText: { color: AppColors.primary, fontSize: 13, fontWeight: "800" },
  locationInfo: { color: AppColors.muted, fontSize: 11, lineHeight: 17, marginTop: 8 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14,
    marginTop: 12,
    color: AppColors.text,
    backgroundColor: "#FCFDFF",
  },
  radiusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 14,
  },
  radiusButton: {
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  radiusSelected: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  radiusText: { color: AppColors.muted, fontSize: 11, fontWeight: "700" },
  radiusSelectedText: { color: AppColors.surface },
  availabilityRow: {
    minHeight: 54,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
    marginTop: 12,
    paddingTop: 8,
  },
  availabilityCopy: { flex: 1 },
  availabilityLabel: { color: AppColors.text, fontSize: 12, fontWeight: "700" },
  fieldLabel: { color: AppColors.text, fontSize: 12, fontWeight: "700", marginTop: 8 },
  problemInput: { minHeight: 72, textAlignVertical: "top" },
  findButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: AppColors.primary,
    borderRadius: 13,
    marginTop: 14,
  },
  findButtonText: { color: AppColors.surface, fontSize: 14, fontWeight: "800" },
  findButtonArrow: { color: AppColors.surface, fontSize: 18, fontWeight: "700" },
  linkText: { color: AppColors.primary, fontSize: 12, fontWeight: "800" },
  loader: { marginVertical: 18 },
  emptyCard: {
    alignItems: "center",
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 18,
    padding: 22,
    marginBottom: 24,
  },
  searchError: {
    color: AppColors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  emptyIcon: {
    color: AppColors.primary,
    fontSize: 26,
    width: 52,
    height: 52,
    textAlign: "center",
    textAlignVertical: "center",
    borderRadius: 18,
    backgroundColor: AppColors.primarySoft,
    overflow: "hidden",
    marginBottom: 12,
  },
  emptyTitle: { color: AppColors.text, fontSize: 14, fontWeight: "800" },
  emptyText: {
    color: AppColors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
  },
  emptyLink: { paddingVertical: 10, paddingHorizontal: 14, marginTop: 3 },
  emptyLinkText: { color: AppColors.primary, fontSize: 12, fontWeight: "800" },
  providerCard: {
    backgroundColor: AppColors.surface,
    borderColor: AppColors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    marginBottom: 12,
  },
  providerTopRow: { flexDirection: "row", alignItems: "center" },
  providerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: AppColors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  providerAvatarText: { color: AppColors.primary, fontSize: 19, fontWeight: "800" },
  providerDetails: { flex: 1, marginLeft: 11 },
  providerName: { color: AppColors.text, fontSize: 14, fontWeight: "800" },
  demoBadge: {
    color: AppColors.primary,
    fontSize: 9,
    fontWeight: "900",
    marginTop: 3,
  },
  providerService: { color: AppColors.muted, fontSize: 12, marginTop: 3 },
  statusPill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  availablePill: { backgroundColor: AppColors.successSoft },
  unavailablePill: { backgroundColor: AppColors.dangerSoft },
  statusPillText: { fontSize: 10, fontWeight: "800" },
  availableText: { color: AppColors.success },
  unavailableText: { color: AppColors.danger },
  providerMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
    marginTop: 13,
    paddingTop: 11,
  },
  providerMeta: { color: AppColors.muted, fontSize: 11, flexShrink: 1 },
  distanceText: { color: AppColors.primary, fontSize: 11, fontWeight: "700" },
  demoDetails: {
    backgroundColor: AppColors.primarySoft,
    borderRadius: 12,
    padding: 11,
    marginTop: 11,
  },
  demoDetailText: { color: AppColors.text, fontSize: 11, fontWeight: "700" },
  demoDescription: {
    color: AppColors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  demoDisclaimer: {
    color: AppColors.primary,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 6,
  },
  providerFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
  },
  providerPhone: { color: AppColors.text, fontSize: 12, fontWeight: "600" },
  bookButton: {
    minHeight: 38,
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppColors.primary,
    borderRadius: 11,
    paddingHorizontal: 13,
  },
  bookButtonText: { color: AppColors.surface, fontSize: 12, fontWeight: "800" },
  disabledButton: { opacity: 0.55 },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 14,
  },
  emptyBookingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: AppColors.surface,
    borderColor: AppColors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    marginBottom: 14,
  },
  emptyBookingIcon: { color: AppColors.primary, fontSize: 22, marginRight: 13 },
  emptyBookingCopy: { flex: 1 },
  emptyBookingTitle: { color: AppColors.text, fontSize: 13, fontWeight: "800" },
  emptyBookingText: { color: AppColors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  bookingCard: {
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 17,
    padding: 15,
    marginBottom: 12,
  },
  bookingTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bookingId: { color: AppColors.muted, fontSize: 11, fontWeight: "700" },
  bookingStatusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  bookingStatusText: { fontSize: 10, fontWeight: "800" },
  bookingService: { color: AppColors.text, fontSize: 15, fontWeight: "800", marginTop: 11 },
  bookingProvider: { color: AppColors.muted, fontSize: 12, marginTop: 5 },
  bookingProblem: { color: AppColors.text, fontSize: 12, lineHeight: 18, marginTop: 9 },
  bookingPhone: { color: AppColors.primary, fontSize: 12, fontWeight: "700", marginTop: 8 },
  bottomNav: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: AppColors.surface,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
    paddingHorizontal: 10,
    paddingTop: 5,
  },
  navItem: { flex: 1, minHeight: 54, alignItems: "center", justifyContent: "center" },
  navIcon: { color: AppColors.muted, fontSize: 21 },
  navLabel: { color: AppColors.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  navActive: { color: AppColors.primary },
});
