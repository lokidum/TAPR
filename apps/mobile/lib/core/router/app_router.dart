import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/router/route_names.dart';
import 'package:tapr/shared/widgets/error_view.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: false,
    errorBuilder: (context, state) => Scaffold(
      body: ErrorView(
        message: 'Page not found',
        icon: Icons.explore_off_rounded,
        onRetry: () => context.go('/'),
      ),
    ),
    routes: [
      GoRoute(
        path: '/',
        name: RouteNames.home,
        builder: (context, state) => const _PlaceholderScreen(title: 'TAPR'),
      ),
    ],
  );
});

class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Text(
          title,
          style: Theme.of(context).textTheme.displayMedium,
        ),
      ),
    );
  }
}
