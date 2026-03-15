import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:tapr/core/network/token_storage.dart';
import 'package:tapr/features/auth/auth_notifier.dart';
import 'package:tapr/features/booking/data/booking_detail_models.dart';
import 'package:tapr/features/booking/data/booking_detail_repository.dart';
import 'package:tapr/features/booking/presentation/screens/booking_detail_screen.dart';

class MockBookingDetailRepository extends Mock
    implements BookingDetailRepository {}

class MockTokenStorage extends Mock implements TokenStorage {}

void main() {
  late MockBookingDetailRepository mockRepository;
  late MockTokenStorage mockTokenStorage;

  final completedBookingNoReview = BookingDetail(
    id: 'booking-1',
    consumerId: 'consumer-1',
    barberId: 'barber-1',
    serviceType: 'in_studio',
    status: 'completed',
    scheduledAt: DateTime.now().add(const Duration(days: 1)),
    durationMinutes: 30,
    priceCents: 5000,
    platformFeeCents: 500,
    barberPayoutCents: 4500,
    reviewedAt: null,
    createdAt: DateTime.now(),
    updatedAt: DateTime.now(),
  );

  final completedBookingWithReview = BookingDetail(
    id: 'booking-2',
    consumerId: 'consumer-1',
    barberId: 'barber-1',
    serviceType: 'in_studio',
    status: 'completed',
    scheduledAt: DateTime.now().add(const Duration(days: 1)),
    durationMinutes: 30,
    priceCents: 5000,
    platformFeeCents: 500,
    barberPayoutCents: 4500,
    reviewedAt: DateTime.now(),
    createdAt: DateTime.now(),
    updatedAt: DateTime.now(),
  );

  setUp(() {
    mockRepository = MockBookingDetailRepository();
    mockTokenStorage = MockTokenStorage();

    when(() => mockTokenStorage.getAccessToken())
        .thenAnswer((_) async => 'token');
    when(() => mockTokenStorage.getRefreshToken())
        .thenAnswer((_) async => 'refresh');
    when(() => mockTokenStorage.getUserId()).thenAnswer((_) async => 'consumer-1');
    when(() => mockTokenStorage.getRole()).thenAnswer((_) async => 'consumer');
  });

  Widget buildTestWidget({
    required String bookingId,
    required BookingDetail booking,
  }) {
    when(() => mockRepository.fetchBooking(any()))
        .thenAnswer((_) async => booking);

    return ProviderScope(
      overrides: [
        bookingDetailRepositoryProvider.overrideWithValue(mockRepository),
        authNotifierProvider.overrideWith((ref) => AuthNotifier(mockTokenStorage)),
        tokenStorageProvider.overrideWithValue(mockTokenStorage),
      ],
      child: MaterialApp(
        home: BookingDetailScreen(bookingId: bookingId),
      ),
    );
  }

  testWidgets('shows review form for completed booking when consumer and not reviewed',
      (tester) async {
    await tester.pumpWidget(
      buildTestWidget(
        bookingId: 'booking-1',
        booking: completedBookingNoReview,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Leave a review'), findsOneWidget);
    expect(find.text('Submit Review'), findsOneWidget);
  });

  testWidgets('does not show review form when already reviewed', (tester) async {
    await tester.pumpWidget(
      buildTestWidget(
        bookingId: 'booking-2',
        booking: completedBookingWithReview,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Leave a review'), findsNothing);
  });
}
