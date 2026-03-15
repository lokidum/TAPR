import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:table_calendar/table_calendar.dart';
import 'package:tapr/core/payment/stripe_payment_service.dart';
import 'package:tapr/features/booking/data/booking_models.dart';
import 'package:tapr/features/booking/data/booking_repository.dart';
import 'package:tapr/features/booking/presentation/booking_controller.dart';
import 'package:tapr/features/booking/presentation/screens/booking_screen.dart';
import 'package:tapr/features/booking/presentation/widgets/step_confirmation.dart';

class MockBookingRepository extends Mock implements BookingRepository {}

class MockStripePaymentService extends Mock implements StripePaymentService {}

void main() {
  late MockBookingRepository mockRepository;
  late MockStripePaymentService mockPaymentService;

  const barberId = 'barber-1';
  const testService = BarberServiceModel(
    id: 'svc-1',
    name: 'Haircut',
    description: null,
    durationMinutes: 30,
    priceCents: 5000,
    isActive: true,
  );
  const testBookingResult = BookingResult(
    bookingId: 'booking-1',
    clientSecret: 'pi_secret_xxx',
    status: 'pending',
    scheduledAt: '2025-03-18T09:00:00.000Z',
    durationMinutes: 30,
    priceCents: 5000,
    platformFeeCents: 500,
    barberPayoutCents: 4500,
  );

  setUp(() {
    mockRepository = MockBookingRepository();
    mockPaymentService = MockStripePaymentService();

    when(() => mockRepository.fetchServices(any()))
        .thenAnswer((_) async => [testService]);
    when(() => mockRepository.fetchAvailability(any(), any()))
        .thenAnswer((_) async => []);
    when(() => mockRepository.createBooking(
          barberId: any(named: 'barberId'),
          serviceId: any(named: 'serviceId'),
          serviceType: any(named: 'serviceType'),
          scheduledAt: any(named: 'scheduledAt'),
        )).thenAnswer((_) async => testBookingResult);

    when(() => mockPaymentService.initPaymentSheet(clientSecret: any(named: 'clientSecret')))
        .thenAnswer((_) async {});
    when(() => mockPaymentService.presentPaymentSheet())
        .thenAnswer((_) async {});
  });

  Widget buildTestWidget() {
    final router = GoRouter(
      initialLocation: '/book/$barberId',
      routes: [
        GoRoute(
          path: '/book/:barberId',
          builder: (_, state) {
            final id = state.pathParameters['barberId']!;
            return BookingScreen(barberId: id);
          },
        ),
        GoRoute(
          path: '/bookings/:id',
          builder: (_, __) => const SizedBox(),
        ),
      ],
    );
    return ProviderScope(
      overrides: [
        bookingRepositoryProvider.overrideWithValue(mockRepository),
        stripePaymentServiceProvider.overrideWithValue(mockPaymentService),
      ],
      child: MaterialApp.router(
        routerConfig: router,
      ),
    );
  }

  testWidgets('shows all four steps in order', (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.text('Select Service'), findsOneWidget);
    expect(find.text('Where?'), findsOneWidget);

    await tester.tap(find.text('Studio'));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Haircut'), 100);
    await tester.tap(find.text('Haircut'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Pick Date & Time'), findsOneWidget);

    await tester.tap(find.descendant(
      of: find.byType(TableCalendar),
      matching: find.text('18'),
    ).first);
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('9:00 AM').first);
    await tester.tap(find.text('9:00 AM').first);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('Confirm Booking'), findsOneWidget);
    expect(find.textContaining('Confirm & Pay'), findsOneWidget);

    await tester.tap(find.textContaining('Confirm & Pay'));
    await tester.pumpAndSettle();

    expect(find.text('Your booking is confirmed!'), findsOneWidget);
    expect(find.text('View Booking'), findsOneWidget);
  });

  testWidgets('Confirm and Pay is disabled when no time slot selected',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: _StepConfirmationHarness(
            selectedTime: null,
            isCreatingBooking: false,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
    expect(button.onPressed, isNull);
  });
}

class _StepConfirmationHarness extends StatelessWidget {
  const _StepConfirmationHarness({
    required this.selectedTime,
    required this.isCreatingBooking,
  });

  final String? selectedTime;
  final bool isCreatingBooking;

  static final _testDate = DateTime(2025, 3, 18);

  @override
  Widget build(BuildContext context) {
    final state = BookingState(
      currentStep: 3,
      selectedServiceType: 'Studio',
      selectedService: const BarberServiceModel(
        id: 'svc-1',
        name: 'Haircut',
        durationMinutes: 30,
        priceCents: 5000,
        isActive: true,
      ),
      selectedDate: _testDate,
      selectedTime: selectedTime,
      isCreatingBooking: isCreatingBooking,
    );
    return StepConfirmation(
      state: state,
      onConfirmAndPay: () {},
    );
  }
}
