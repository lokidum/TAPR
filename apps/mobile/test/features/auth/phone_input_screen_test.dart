import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:tapr/features/auth/data/auth_repository.dart';
import 'package:tapr/features/auth/presentation/screens/phone_input_screen.dart';
import 'package:tapr/core/network/token_storage.dart';

class MockAuthRepository extends Mock implements AuthRepository {}

class MockTokenStorage extends Mock implements TokenStorage {}

void main() {
  late MockAuthRepository mockAuthRepository;
  late MockTokenStorage mockTokenStorage;

  setUp(() {
    mockAuthRepository = MockAuthRepository();
    mockTokenStorage = MockTokenStorage();

    when(() => mockTokenStorage.getAccessToken())
        .thenAnswer((_) async => null);
    when(() => mockTokenStorage.getRefreshToken())
        .thenAnswer((_) async => null);
    when(() => mockTokenStorage.getUserId()).thenAnswer((_) async => null);
    when(() => mockTokenStorage.getRole()).thenAnswer((_) async => null);
  });

  Widget buildTestWidget() {
    final router = GoRouter(
      initialLocation: '/auth/phone',
      routes: [
        GoRoute(
          path: '/auth/phone',
          builder: (_, __) => const PhoneInputScreen(),
        ),
        GoRoute(
          path: '/auth/otp',
          builder: (_, state) => const SizedBox(),
        ),
      ],
    );
    return ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(mockAuthRepository),
        tokenStorageProvider.overrideWithValue(mockTokenStorage),
      ],
      child: MaterialApp.router(
        routerConfig: router,
      ),
    );
  }

  Future<void> enterPhoneAndTapSend(WidgetTester tester, String phone) async {
    await tester.enterText(find.byType(TextField), phone);
    await tester.tap(find.text('Send Code'));
    await tester.pumpAndSettle();
  }

  testWidgets('shows error when empty phone submitted', (tester) async {
    when(() => mockAuthRepository.requestOtp(any()))
        .thenAnswer((_) async => throw Exception('should not be called'));

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Send Code'));
    await tester.pumpAndSettle();

    expect(find.text('Please enter your phone number.'), findsOneWidget);
  });

  testWidgets('shows error when too short phone submitted', (tester) async {
    when(() => mockAuthRepository.requestOtp(any()))
        .thenAnswer((_) async => throw Exception('should not be called'));

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    await enterPhoneAndTapSend(tester, '123');

    expect(
      find.text('Please enter a valid Australian phone number.'),
      findsOneWidget,
    );
  });

  testWidgets('valid mobile number passes and calls requestOtp', (tester) async {
    when(() => mockAuthRepository.requestOtp(any())).thenAnswer((_) async {});

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    await enterPhoneAndTapSend(tester, '0412345678');

    verify(() => mockAuthRepository.requestOtp('+61412345678')).called(1);
  });

  testWidgets('valid landline passes and calls requestOtp', (tester) async {
    when(() => mockAuthRepository.requestOtp(any())).thenAnswer((_) async {});

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    await enterPhoneAndTapSend(tester, '212345678');

    verify(() => mockAuthRepository.requestOtp('+61212345678')).called(1);
  });
}
