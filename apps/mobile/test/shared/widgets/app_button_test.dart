import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tapr/shared/widgets/app_button.dart';

void main() {
  testWidgets('shows loading spinner when isLoading is true', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AppButton(
            label: 'Submit',
            onPressed: () {},
            isLoading: true,
          ),
        ),
      ),
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('does not fire onPressed when isLoading is true', (tester) async {
    var pressed = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AppButton(
            label: 'Submit',
            onPressed: () => pressed = true,
            isLoading: true,
          ),
        ),
      ),
    );

    await tester.tap(find.byType(ElevatedButton));
    await tester.pump();

    expect(pressed, isFalse);
  });
}
