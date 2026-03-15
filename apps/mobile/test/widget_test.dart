import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:tapr/app.dart';

void main() {
  testWidgets(
    'App renders welcome screen when unauthenticated',
    (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: TaprApp()),
      );
      await tester.pumpAndSettle();

      expect(find.text('TAPR'), findsOneWidget);
    },
    skip: true, // Requires Firebase and push notification setup
  );
}
