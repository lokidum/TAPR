import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:tapr/features/barber/data/barber_dashboard_models.dart';
import 'package:tapr/features/barber/data/barber_dashboard_repository.dart';

class BarberDashboardState {
  const BarberDashboardState({
    this.stats,
    this.upcomingBookings = const [],
    this.isLoading = false,
    this.error,
    this.showLevelUpCelebration = false,
    this.isTogglingOnCall = false,
  });

  final BarberDashboardStats? stats;
  final List<UpcomingBookingCard> upcomingBookings;
  final bool isLoading;
  final String? error;
  final bool showLevelUpCelebration;
  final bool isTogglingOnCall;

  BarberDashboardState copyWith({
    BarberDashboardStats? stats,
    List<UpcomingBookingCard>? upcomingBookings,
    bool? isLoading,
    String? error,
    bool? showLevelUpCelebration,
    bool? isTogglingOnCall,
    bool clearError = false,
  }) {
    return BarberDashboardState(
      stats: stats ?? this.stats,
      upcomingBookings: upcomingBookings ?? this.upcomingBookings,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
      showLevelUpCelebration:
          showLevelUpCelebration ?? this.showLevelUpCelebration,
      isTogglingOnCall: isTogglingOnCall ?? this.isTogglingOnCall,
    );
  }
}

class BarberDashboardController extends StateNotifier<BarberDashboardState> {
  BarberDashboardController(this._repository)
      : super(const BarberDashboardState());

  final BarberDashboardRepository _repository;

  Future<void> loadDashboard() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final results = await Future.wait([
        _repository.fetchStats(),
        _repository.fetchUpcoming(),
      ]);

      final stats = results[0] as BarberDashboardStats;
      final upcoming = results[1] as List<UpcomingBookingCard>;

      state = state.copyWith(
        stats: stats,
        upcomingBookings: upcoming,
        isLoading: false,
        showLevelUpCelebration: stats.levelUpPending,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to load dashboard',
      );
    }
  }

  Future<void> acknowledgeLevelUp() async {
    state = state.copyWith(showLevelUpCelebration: false);
    try {
      await _repository.acknowledgeLevelUp();
      if (state.stats != null) {
        state = state.copyWith(
          stats: state.stats!.copyWith(levelUpPending: false),
        );
      }
    } catch (_) {}
  }

  Future<void> toggleOnCall(bool enable) async {
    if (state.isTogglingOnCall) return;
    state = state.copyWith(isTogglingOnCall: true, clearError: true);

    try {
      if (enable) {
        final permission = await Geolocator.checkPermission();
        LocationPermission finalPermission = permission;

        if (permission == LocationPermission.denied) {
          finalPermission = await Geolocator.requestPermission();
        }

        if (finalPermission == LocationPermission.denied ||
            finalPermission == LocationPermission.deniedForever) {
          state = state.copyWith(
            isTogglingOnCall: false,
            error: 'Location permission is required to go on-call',
          );
          return;
        }

        final position = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.medium,
        );
        await _repository.goOnCall(position.latitude, position.longitude);
      } else {
        await _repository.goOffCall();
      }

      if (state.stats != null) {
        state = state.copyWith(
          stats: state.stats!.copyWith(isOnCall: enable),
          isTogglingOnCall: false,
        );
      } else {
        state = state.copyWith(isTogglingOnCall: false);
      }
    } catch (e) {
      state = state.copyWith(
        isTogglingOnCall: false,
        error: enable
            ? 'Failed to go on-call'
            : 'Failed to go off-call',
      );
    }
  }

  Future<void> refresh() async {
    await loadDashboard();
  }
}

final barberDashboardControllerProvider = StateNotifierProvider.autoDispose<
    BarberDashboardController, BarberDashboardState>((ref) {
  final repository = ref.read(barberDashboardRepositoryProvider);
  return BarberDashboardController(repository);
});
