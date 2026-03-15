import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/router/route_names.dart';
import 'package:tapr/core/router/shells/barber_shell.dart';
import 'package:tapr/core/router/shells/consumer_shell.dart';
import 'package:tapr/core/router/shells/studio_shell.dart';
import 'package:tapr/features/auth/auth_notifier.dart';
import 'package:tapr/features/auth/presentation/screens/onboarding_screen.dart';
import 'package:tapr/features/auth/presentation/screens/otp_screen.dart';
import 'package:tapr/features/auth/presentation/screens/phone_input_screen.dart';
import 'package:tapr/features/auth/presentation/screens/welcome_screen.dart';
import 'package:tapr/features/barber/presentation/screens/barber_bookings_screen.dart';
import 'package:tapr/features/barber/presentation/screens/barber_home_screen.dart';
import 'package:tapr/features/barber/presentation/screens/barber_public_profile_screen.dart';
import 'package:tapr/features/marketplace/presentation/screens/chair_map_screen.dart';
import 'package:tapr/features/barber/presentation/screens/portfolio_screen.dart';
import 'package:tapr/features/booking/presentation/screens/booking_detail_screen.dart';
import 'package:tapr/features/booking/screens/booking_history_screen.dart';
import 'package:tapr/features/booking/presentation/screens/booking_screen.dart';
import 'package:tapr/features/discover/presentation/screens/discover_screen.dart';
import 'package:tapr/features/events/presentation/screens/event_detail_screen.dart';
import 'package:tapr/features/events/presentation/screens/events_screen.dart';
import 'package:tapr/features/legal/presentation/screens/legal_hub_screen.dart';
import 'package:tapr/features/marketplace/screens/marketplace_screen.dart';
import 'package:tapr/features/notifications/presentation/screens/notifications_screen.dart';
import 'package:tapr/features/profile/presentation/screens/profile_screen.dart';
import 'package:tapr/features/studio/presentation/screens/chair_manager_screen.dart';
import 'package:tapr/features/studio/presentation/screens/studio_dashboard_screen.dart';
import 'package:tapr/features/studio/presentation/screens/talent_scout_screen.dart';
import 'package:tapr/features/studio/presentation/screens/create_event_screen.dart';
import 'package:tapr/features/studio/presentation/screens/studio_events_screen.dart';
import 'package:tapr/features/studio/screens/studio_public_profile_screen.dart';
import 'package:tapr/core/services/push_notification_service.dart';
import 'package:tapr/shared/widgets/error_view.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

final appRouterProvider = Provider<GoRouter>((ref) {
  PushNotificationService.setNavigatorKey(rootNavigatorKey);

  final notifier = ref.read(authNotifierProvider.notifier);
  final authState = ref.watch(authNotifierProvider);

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/auth/welcome',
    debugLogDiagnostics: false,
    refreshListenable: notifier.refreshNotifier,
    redirect: (context, state) {
      final auth = authState;
      final location = state.matchedLocation;
      final isOnAuth = location.startsWith('/auth');

      if (auth.isLoading) return null;

      if (!auth.isAuthenticated) {
        return isOnAuth ? null : '/auth/welcome';
      }

      if (isOnAuth || location == '/') return auth.homeRoute;

      return null;
    },
    errorBuilder: (context, state) => Scaffold(
      body: ErrorView(
        message: 'Page not found',
        icon: Icons.explore_off_rounded,
        onRetry: () => context.go('/auth/welcome'),
      ),
    ),
    routes: [
      // --- Auth flow ---
      GoRoute(
        path: '/auth/welcome',
        name: RouteNames.welcome,
        builder: (context, state) => const WelcomeScreen(),
      ),
      GoRoute(
        path: '/auth/phone',
        name: RouteNames.phone,
        builder: (context, state) => const PhoneInputScreen(),
      ),
      GoRoute(
        path: '/auth/otp',
        name: RouteNames.otp,
        builder: (context, state) =>
            OTPScreen(phone: state.extra as String? ?? ''),
      ),
      GoRoute(
        path: '/auth/onboarding',
        name: RouteNames.onboarding,
        builder: (context, state) => const OnboardingScreen(),
      ),

      // --- Consumer shell ---
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            ConsumerShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/discover',
                name: RouteNames.discover,
                builder: (context, state) => const DiscoverScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/bookings',
                name: RouteNames.bookings,
                builder: (context, state) => const BookingHistoryScreen(),
                routes: [
                  GoRoute(
                    path: ':id',
                    name: RouteNames.bookingDetail,
                    builder: (context, state) => BookingDetailScreen(
                      bookingId: state.pathParameters['id']!,
                    ),
                  ),
                ],
              ),
              GoRoute(
                path: '/book/:barberId',
                name: RouteNames.book,
                builder: (context, state) => BookingScreen(
                  barberId: state.pathParameters['barberId']!,
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/marketplace',
                name: RouteNames.marketplace,
                builder: (context, state) => const MarketplaceScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/events',
                name: RouteNames.events,
                builder: (context, state) => const EventsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/profile',
                name: RouteNames.profile,
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),

      // --- Barber shell ---
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            BarberShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/barber/home',
                name: RouteNames.barberHome,
                builder: (context, state) => const BarberHomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/barber/bookings',
                name: RouteNames.barberBookings,
                builder: (context, state) => const BarberBookingsScreen(),
                routes: [
                  GoRoute(
                    path: ':id',
                    name: RouteNames.barberBookingDetail,
                    builder: (context, state) => BookingDetailScreen(
                      bookingId: state.pathParameters['id']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/barber/portfolio',
                name: RouteNames.portfolio,
                builder: (context, state) => const PortfolioScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/barber/marketplace',
                name: RouteNames.chairMap,
                builder: (context, state) => const ChairMapScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/barber/legal',
                name: RouteNames.legalHub,
                builder: (context, state) => const LegalHubScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/barber/profile',
                name: RouteNames.barberProfile,
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),

      // --- Studio shell ---
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            StudioShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/studio/dashboard',
                name: RouteNames.studioDashboard,
                builder: (context, state) => const StudioDashboardScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/studio/chairs',
                name: RouteNames.studioChairs,
                builder: (context, state) => const ChairManagerScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/studio/talent',
                name: RouteNames.talentScout,
                builder: (context, state) => const TalentScoutScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/studio/events',
                name: RouteNames.studioEvents,
                builder: (context, state) => const StudioEventsScreen(),
                routes: [
                  GoRoute(
                    path: 'create',
                    name: RouteNames.createEvent,
                    builder: (context, state) => const CreateEventScreen(),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/studio/profile',
                name: RouteNames.studioProfile,
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),

      // --- Shared routes ---
      GoRoute(
        path: '/barbers/:id',
        name: RouteNames.barberPublicProfile,
        builder: (context, state) => BarberPublicProfileScreen(
          barberId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/studios/:id',
        name: RouteNames.studioPublicProfile,
        builder: (context, state) => StudioPublicProfileScreen(
          studioId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/events/:id',
        name: RouteNames.eventDetail,
        builder: (context, state) => EventDetailScreen(
          eventId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/notifications',
        name: RouteNames.notifications,
        builder: (context, state) => const NotificationsScreen(),
      ),
    ],
  );
});
