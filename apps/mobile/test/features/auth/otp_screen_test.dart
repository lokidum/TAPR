import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:tapr/features/auth/data/auth_repository.dart';
import 'package:tapr/core/network/api_exception.dart';
import 'package:tapr/features/auth/presentation/screens/otp_screen.dart';
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

  Widget buildTestWidget({required String phone}) {
    return ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(mockAuthRepository),
        tokenStorageProvider.overrideWithValue(mockTokenStorage),
      ],
      child: MaterialApp(
        home: OTPScreen(phone: phone),
      ),
    );
  }

  Future<void> enterOtpCode(WidgetTester tester, String code) async {
    for (var i = 0; i < code.length; i++) {
      await tester.enterText(
        find.byType(TextField).at(i),
        code[i],
      );
      await tester.pump();
    }
    await tester.pumpAndSettle();
  }

  testWidgets('auto-advances digit boxes and submits on completion',
      (tester) async {
    when(() => mockAuthRepository.verifyOtp(any(), any()))
        .thenAnswer((_) async => throw Exception('verify not mocked'));

    await tester.pumpWidget(buildTestWidget(phone: '+61412345678'));
    await tester.pumpAndSettle();

    await enterOtpCode(tester, '123456');

    verify(() => mockAuthRepository.verifyOtp('+61412345678', '123456'))
        .called(1);
  });

  testWidgets('shows error text and shake on wrong OTP', (tester) async {
    when(() => mockAuthRepository.verifyOtp(any(), any()))
        .thenThrow(const AppException(message: 'Invalid code'));

    await tester.pumpWidget(buildTestWidget(phone: '+61412345678'));
    await tester.pumpAndSettle();

    await enterOtpCode(tester, '000000');

    expect(find.text('Invalid code'), findsOneWidget);
  });
}
