const DEMO_PROVIDERS = [
  {
    id: "demo:arjun-kumar-electrical",
    user_id: null,
    name: "Demo Arjun Kumar",
    phone: "DEMO ONLY",
    service_type: "Electrical",
    location: "Nagercoil",
    latitude: 8.1833,
    longitude: 77.4119,
    is_available: true,
    starting_price_inr: 450,
    experience_years: 6,
    demo_rating: 4.8,
    description:
      "Fictional electrician profile for a college project demonstration.",
  },
  {
    id: "demo:meena-selvi-plumbing",
    user_id: null,
    name: "Demo Meena Selvi",
    phone: "DEMO ONLY",
    service_type: "Plumbing",
    location: "Kanyakumari",
    latitude: 8.0883,
    longitude: 77.5385,
    is_available: true,
    starting_price_inr: 350,
    experience_years: 5,
    demo_rating: 4.7,
    description:
      "Fictional plumbing profile with illustrative pricing and demo feedback.",
  },
  {
    id: "demo:priya-natarajan-cleaning",
    user_id: null,
    name: "Demo Priya Natarajan",
    phone: "DEMO ONLY",
    service_type: "Cleaning",
    location: "Marthandam",
    latitude: 8.3047,
    longitude: 77.2196,
    is_available: true,
    starting_price_inr: 500,
    experience_years: 4,
    demo_rating: 4.9,
    description:
      "Fictional home-cleaning profile created for a student app demo.",
  },
  {
    id: "demo:karthik-raj-carpentry",
    user_id: null,
    name: "Demo Karthik Raj",
    phone: "DEMO ONLY",
    service_type: "Carpentry",
    location: "Tirunelveli",
    latitude: 8.7139,
    longitude: 77.7567,
    is_available: false,
    starting_price_inr: 600,
    experience_years: 8,
    demo_rating: 4.6,
    description:
      "Fictional carpentry profile; availability and rating are illustrative.",
  },
  {
    id: "demo:lakshmi-devi-painting",
    user_id: null,
    name: "Demo Lakshmi Devi",
    phone: "DEMO ONLY",
    service_type: "Painting",
    location: "Nagercoil",
    latitude: 8.1833,
    longitude: 77.4119,
    is_available: true,
    starting_price_inr: 700,
    experience_years: 7,
    demo_rating: 4.8,
    description:
      "Fictional painter profile with an illustrative starting estimate.",
  },
  {
    id: "demo:vignesh-balan-appliance-repair",
    user_id: null,
    name: "Demo Vignesh Balan",
    phone: "DEMO ONLY",
    service_type: "Appliance Repair",
    location: "Marthandam",
    latitude: 8.3047,
    longitude: 77.2196,
    is_available: true,
    starting_price_inr: 550,
    experience_years: 5,
    demo_rating: 4.7,
    description:
      "Fictional appliance-repair profile for demonstration only.",
  },
  {
    id: "demo:suresh-kumar-electrical",
    user_id: null,
    name: "Demo Suresh Kumar",
    phone: "DEMO ONLY",
    service_type: "Electrical",
    location: "Tirunelveli",
    latitude: 8.7139,
    longitude: 77.7567,
    is_available: true,
    starting_price_inr: 400,
    experience_years: 9,
    demo_rating: 4.5,
    description:
      "Fictional electrical-service profile; not a real or verified business.",
  },
  {
    id: "demo:revathi-anand-plumbing",
    user_id: null,
    name: "Demo Revathi Anand",
    phone: "DEMO ONLY",
    service_type: "Plumbing",
    location: "Nagercoil",
    latitude: 8.1833,
    longitude: 77.4119,
    is_available: false,
    starting_price_inr: 300,
    experience_years: 3,
    demo_rating: 4.9,
    description:
      "Fictional plumbing profile; all experience and rating details are demo values.",
  },
];

function distanceInKilometers(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(toLatitude - fromLatitude);
  const longitudeDelta = radians(toLongitude - fromLongitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(fromLatitude)) *
      Math.cos(radians(toLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function findDemoProviders({
  service,
  location,
  latitude,
  longitude,
  radiusKm,
  availableOnly,
}) {
  const serviceQuery = service.trim().toLocaleLowerCase();
  const serviceMatches = (providerService) =>
    providerService.toLocaleLowerCase().includes(serviceQuery) ||
    (serviceQuery === "appliances" &&
      providerService.toLocaleLowerCase() === "appliance repair");
  const locationQuery =
    typeof location === "string" ? location.trim().toLocaleLowerCase() : "";
  const hasCoordinates =
    Number.isFinite(latitude) && Number.isFinite(longitude);

  return DEMO_PROVIDERS.filter((provider) => {
    if (!serviceMatches(provider.service_type)) return false;
    if (
      locationQuery &&
      !provider.location.toLocaleLowerCase().includes(locationQuery)
    ) {
      return false;
    }
    if (availableOnly && !provider.is_available) return false;
    if (
      hasCoordinates &&
      distanceInKilometers(
        latitude,
        longitude,
        provider.latitude,
        provider.longitude
      ) > radiusKm
    ) {
      return false;
    }
    return true;
  }).map((provider) => ({
    ...provider,
    distance_km: hasCoordinates
      ? Number(
          distanceInKilometers(
            latitude,
            longitude,
            provider.latitude,
            provider.longitude
          ).toFixed(2)
        )
      : null,
    is_demo: true,
  }));
}

module.exports = { DEMO_PROVIDERS, distanceInKilometers, findDemoProviders };
