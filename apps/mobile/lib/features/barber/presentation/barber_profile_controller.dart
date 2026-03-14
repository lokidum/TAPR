import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/features/barber/data/barber_profile_models.dart';
import 'package:tapr/features/barber/data/barber_profile_repository.dart';

class BarberProfileState {
  const BarberProfileState({
    this.profile,
    this.isLoading = false,
    this.error,
  });

  final BarberProfileDetail? profile;
  final bool isLoading;
  final String? error;

  BarberProfileState copyWith({
    BarberProfileDetail? profile,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return BarberProfileState(
      profile: profile ?? this.profile,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class BarberProfileController extends StateNotifier<BarberProfileState> {
  BarberProfileController(this._repository)
      : super(const BarberProfileState());

  final BarberProfileRepository _repository;

  Future<void> loadProfile(String barberId) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final profile = await _repository.fetchProfile(barberId);
      state = state.copyWith(profile: profile, isLoading: false);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to load barber profile',
      );
    }
  }
}

final barberProfileControllerProvider =
    StateNotifierProvider.autoDispose<BarberProfileController, BarberProfileState>(
        (ref) {
  return BarberProfileController(ref.read(barberProfileRepositoryProvider));
});
