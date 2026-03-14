import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:tapr/features/booking/data/booking_models.dart';
import 'package:tapr/features/booking/data/booking_repository.dart';

class BookingState {
  const BookingState({
    this.currentStep = 1,
    this.selectedServiceType,
    this.selectedService,
    this.selectedDate,
    this.selectedTime,
    this.services = const [],
    this.bookedSlots = const [],
    this.isLoading = false,
    this.isCreatingBooking = false,
    this.error,
    this.bookingResult,
  });

  final int currentStep;
  final String? selectedServiceType;
  final BarberServiceModel? selectedService;
  final DateTime? selectedDate;
  final String? selectedTime;
  final List<BarberServiceModel> services;
  final List<BookedSlot> bookedSlots;
  final bool isLoading;
  final bool isCreatingBooking;
  final String? error;
  final BookingResult? bookingResult;

  BookingState copyWith({
    int? currentStep,
    String? selectedServiceType,
    BarberServiceModel? selectedService,
    DateTime? selectedDate,
    String? selectedTime,
    List<BarberServiceModel>? services,
    List<BookedSlot>? bookedSlots,
    bool? isLoading,
    bool? isCreatingBooking,
    String? error,
    BookingResult? bookingResult,
    bool clearError = false,
    bool clearSelectedService = false,
    bool clearSelectedDate = false,
    bool clearSelectedTime = false,
    bool clearBookingResult = false,
  }) {
    return BookingState(
      currentStep: currentStep ?? this.currentStep,
      selectedServiceType: selectedServiceType ?? this.selectedServiceType,
      selectedService: clearSelectedService ? null : (selectedService ?? this.selectedService),
      selectedDate: clearSelectedDate ? null : (selectedDate ?? this.selectedDate),
      selectedTime: clearSelectedTime ? null : (selectedTime ?? this.selectedTime),
      services: services ?? this.services,
      bookedSlots: bookedSlots ?? this.bookedSlots,
      isLoading: isLoading ?? this.isLoading,
      isCreatingBooking: isCreatingBooking ?? this.isCreatingBooking,
      error: clearError ? null : (error ?? this.error),
      bookingResult: clearBookingResult ? null : (bookingResult ?? this.bookingResult),
    );
  }

  bool get canProceedStep1 =>
      selectedServiceType != null && selectedService != null;

  bool get canProceedStep2 =>
      selectedDate != null && selectedTime != null;

  int get servicePriceCents => selectedService?.priceCents ?? 0;
  int get platformFeeCents => (servicePriceCents * 0.1).round();
  int get totalCents => servicePriceCents + platformFeeCents;
}

class BookingController extends StateNotifier<BookingState> {
  BookingController(this._repository, this._barberId) : super(const BookingState());

  final BookingRepository _repository;
  final String _barberId;

  Future<void> loadServices() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final services = await _repository.fetchServices(_barberId);
      state = state.copyWith(services: services, isLoading: false);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to load services',
      );
    }
  }

  void selectServiceType(String type) {
    state = state.copyWith(
      selectedServiceType: type,
      clearError: true,
    );
  }

  void selectService(BarberServiceModel service) {
    state = state.copyWith(selectedService: service, clearError: true);
  }

  Future<void> selectDate(DateTime date) async {
    state = state.copyWith(
      selectedDate: date,
      clearSelectedTime: true,
      isLoading: true,
      clearError: true,
    );
    try {
      final dateStr = DateFormat('yyyy-MM-dd').format(date);
      final slots = await _repository.fetchAvailability(_barberId, dateStr);
      state = state.copyWith(bookedSlots: slots, isLoading: false);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Failed to load availability',
      );
    }
  }

  void selectTime(String time) {
    state = state.copyWith(selectedTime: time, clearError: true);
  }

  void nextStep() {
    if (state.currentStep < 4) {
      state = state.copyWith(currentStep: state.currentStep + 1);
    }
  }

  void previousStep() {
    if (state.currentStep > 1) {
      state = state.copyWith(currentStep: state.currentStep - 1);
    }
  }

  Future<void> createBooking() async {
    if (state.selectedDate == null ||
        state.selectedTime == null ||
        state.selectedService == null ||
        state.selectedServiceType == null) {
      return;
    }

    state = state.copyWith(isCreatingBooking: true, clearError: true);

    try {
      final timeParts = state.selectedTime!.split(':');
      final scheduledAt = DateTime.utc(
        state.selectedDate!.year,
        state.selectedDate!.month,
        state.selectedDate!.day,
        int.parse(timeParts[0]),
        int.parse(timeParts[1]),
      );

      final serviceTypeMap = {
        'Studio': 'in_studio',
        'Mobile': 'mobile',
        'On Call': 'on_call',
      };

      final result = await _repository.createBooking(
        barberId: _barberId,
        serviceId: state.selectedService!.id,
        serviceType: serviceTypeMap[state.selectedServiceType!] ?? 'in_studio',
        scheduledAt: scheduledAt.toIso8601String(),
      );

      state = state.copyWith(
        bookingResult: result,
        isCreatingBooking: false,
      );
    } catch (e) {
      state = state.copyWith(
        isCreatingBooking: false,
        error: 'Failed to create booking. Please try again.',
      );
    }
  }
}

final bookingControllerProvider = StateNotifierProvider.autoDispose
    .family<BookingController, BookingState, String>((ref, barberId) {
  final repository = ref.read(bookingRepositoryProvider);
  return BookingController(repository, barberId);
});
