import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:tapr/features/auth/data/barber_levels.dart';
import 'package:tapr/features/barber/data/barber_dashboard_models.dart';
import 'package:tapr/features/barber/data/barber_dashboard_repository.dart';
import 'package:tapr/features/barber/presentation/screens/barber_home_screen.dart';

class MockBarberDashboardRepository extends Mock
    implements BarberDashboardRepository {}

void main() {
  late MockBarberDashboardRepository mockRepository;

  BarberDashboardStats statsForLevel(int level) {
    final barberLevel = barberLevels.firstWhere((l) => l.level == level);
    return BarberDashboardStats(
      todayCount: 2,
      weekEarningsCents: 15000,
      totalCuts: 100,
      averageRating: 4.5,
      level: level,
      title: barberLevel.title,
      levelUpPending: false,
      isOnCall: level.isOdd,
      userName: 'Test Barber',
    );
  }

  setUp(() {
    mockRepository = MockBarberDashboardRepository();
  });

  Widget buildTestWidget({BarberDashboardStats? stats}) {
    when(() => mockRepository.fetchStats())
        .thenAnswer((_) async => stats ?? statsForLevel(3));
    when(() => mockRepository.fetchUpcoming())
        .thenAnswer((_) async => []);

    return ProviderScope(
      overrides: [
        barberDashboardRepositoryProvider.overrideWithValue(mockRepository),
      ],
      child: const MaterialApp(
        home: BarberHomeScreen(),
      ),
    );
  }

  testWidgets('shows on-call toggle', (tester) async {
    await tester.pumpWidget(buildTestWidget(stats: statsForLevel(3)));
    await tester.pumpAndSettle();

    expect(find.byType(Switch), findsOneWidget);
    expect(find.text('On-Call'), findsOneWidget);
  });

  testWidgets('level badge displays correctly for level 1', (tester) async {
    await tester.pumpWidget(buildTestWidget(stats: statsForLevel(1)));
    await tester.pumpAndSettle();

    expect(find.text('LV.1 NOVICE'), findsOneWidget);
  });

  testWidgets('level badge displays correctly for level 2', (tester) async {
    await tester.pumpWidget(buildTestWidget(stats: statsForLevel(2)));
    await tester.pumpAndSettle();
    expect(find.text('LV.2 RISING'), findsOneWidget);
  });

  testWidgets('level badge displays correctly for level 3', (tester) async {
    await tester.pumpWidget(buildTestWidget(stats: statsForLevel(3)));
    await tester.pumpAndSettle();
    expect(find.text('LV.3 SENIOR'), findsOneWidget);
  });

  testWidgets('level badge displays correctly for level 4', (tester) async {
    await tester.pumpWidget(buildTestWidget(stats: statsForLevel(4)));
    await tester.pumpAndSettle();
    expect(find.text('LV.4 EXPERT'), findsOneWidget);
  });

  testWidgets('level badge displays correctly for level 5', (tester) async {
    await tester.pumpWidget(buildTestWidget(stats: statsForLevel(5)));
    await tester.pumpAndSettle();
    expect(find.text('LV.5 CERTIFIED'), findsOneWidget);
  });

  testWidgets('level badge displays correctly for level 6', (tester) async {
    await tester.pumpWidget(buildTestWidget(stats: statsForLevel(6)));
    await tester.pumpAndSettle();
    expect(find.text('LV.6 MASTER'), findsOneWidget);
  });
}
