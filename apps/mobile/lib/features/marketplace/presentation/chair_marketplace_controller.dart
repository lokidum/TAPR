import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:tapr/features/barber/data/barber_profile_repository.dart';
import 'package:tapr/features/marketplace/data/chair_marketplace_models.dart';
import 'package:tapr/features/marketplace/data/chair_marketplace_repository.dart';

class ChairMarketplaceState {
  const ChairMarketplaceState({
    this.listings = const [],
    this.isLoading = false,
    this.error,
    this.userLat,
    this.userLng,
    this.barberLevel = 1,
    this.radiusKm = 10,
    this.sickCallOnly = false,
  });

  final List<NearbyChairListing> listings;
  final bool isLoading;
  final String? error;
  final double? userLat;
  final double? userLng;
  final int barberLevel;
  final int radiusKm;
  final bool sickCallOnly;

  ChairMarketplaceState copyWith({
    List<NearbyChairListing>? listings,
    bool? isLoading,
    String? error,
    double? userLat,
    double? userLng,
    int? barberLevel,
    int? radiusKm,
    bool? sickCallOnly,
    bool clearError = false,
  }) {
    return ChairMarketplaceState(
      listings: listings ?? this.listings,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
      userLat: userLat ?? this.userLat,
      userLng: userLng ?? this.userLng,
      barberLevel: barberLevel ?? this.barberLevel,
      radiusKm: radiusKm ?? this.radiusKm,
      sickCallOnly: sickCallOnly ?? this.sickCallOnly,
    );
  }
}

class ChairMarketplaceController extends StateNotifier<ChairMarketplaceState> {
  ChairMarketplaceController(
    this._chairRepo,
    this._barberRepo,
  ) : super(const ChairMarketplaceState());

  final ChairMarketplaceRepository _chairRepo;
  final BarberProfileRepository _barberRepo;

  Future<void> loadNearby() async {
    state = state.copyWith(isLoading: true, clearError: true);

    try {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        state = state.copyWith(
          isLoading: false,
          error: 'Location permission is required to find chairs nearby.',
        );
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
      );

      final profile = await _barberRepo.fetchMyProfile();
      final listingType =
          state.sickCallOnly ? 'sick_call' : null;

      final listings = await _chairRepo.fetchNearby(
        position.latitude,
        position.longitude,
        radiusKm: state.radiusKm,
        listingType: listingType,
      );

      state = state.copyWith(
        listings: listings,
        isLoading: false,
        userLat: position.latitude,
        userLng: position.longitude,
        barberLevel: profile.level,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  void setRadius(int km) {
    state = state.copyWith(radiusKm: km);
    loadNearby();
  }

  void setSickCallOnly(bool value) {
    state = state.copyWith(sickCallOnly: value);
    loadNearby();
  }

  Future<void> refresh() async {
    await loadNearby();
  }
}

final chairMarketplaceControllerProvider = StateNotifierProvider.autoDispose<
    ChairMarketplaceController, ChairMarketplaceState>((ref) {
  final chairRepo = ref.read(chairMarketplaceRepositoryProvider);
  final barberRepo = ref.read(barberProfileRepositoryProvider);
  return ChairMarketplaceController(chairRepo, barberRepo);
});
