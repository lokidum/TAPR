import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:tapr/features/auth/data/auth_repository.dart';
import 'package:tapr/features/auth/presentation/screens/welcome_screen.dart';
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
    return ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(mockAuthRepository),
        tokenStorageProvider.overrideWithValue(mockTokenStorage),
      ],
      child: const MaterialApp(
        home: WelcomeScreen(),
      ),
    );
  }

  testWidgets('renders Google and Phone login options', (tester) async {
    // Apple Sign In button is platform-dependent (iOS only).
    // On iOS this renders 3 login options. Tested separately on device.
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.text('Continue with Phone'), findsOneWidget);
  });

  testWidgets('renders TAPR branding', (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.text('TAPR'), findsOneWidget);
  });
}
