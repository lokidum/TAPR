import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tapr/features/auth/data/barber_levels.dart';
import 'package:tapr/shared/widgets/level_badge.dart';

void main() {
  testWidgets('displays correct title for each level 1-6', (tester) async {
    for (final barberLevel in barberLevels) {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LevelBadge(
              level: barberLevel.level,
              title: barberLevel.title,
            ),
          ),
        ),
      );

      final expectedText =
          'LV.${barberLevel.level} ${barberLevel.title.toUpperCase()}';
      expect(find.text(expectedText), findsOneWidget);
    }
  });
}
