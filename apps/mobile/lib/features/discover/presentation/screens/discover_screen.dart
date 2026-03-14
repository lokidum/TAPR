import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/features/discover/presentation/discover_controller.dart';
import 'package:tapr/shared/widgets/notification_bell.dart';
import 'package:tapr/features/discover/presentation/widgets/feed_view.dart';
import 'package:tapr/features/discover/presentation/widgets/map_view.dart';

class DiscoverScreen extends ConsumerStatefulWidget {
  const DiscoverScreen({super.key});

  @override
  ConsumerState<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends ConsumerState<DiscoverScreen> {
  bool _showMap = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(discoverControllerProvider.notifier).init();
    });
  }

  @override
  Widget build(BuildContext context) {
    final discoverState = ref.watch(discoverControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      extendBodyBehindAppBar: !_showMap,
      appBar: AppBar(
        backgroundColor: _showMap ? AppColors.surface : Colors.transparent,
        elevation: 0,
        title: _showMap ? const Text('Nearby Barbers') : null,
        actions: [
          const NotificationBell(),
          IconButton(
            icon: Icon(
              _showMap ? Icons.video_library_rounded : Icons.map_rounded,
              color: AppColors.white,
            ),
            onPressed: () => setState(() => _showMap = !_showMap),
            tooltip: _showMap ? 'Feed view' : 'Map view',
          ),
        ],
      ),
      body: discoverState.error != null && discoverState.feedItems.isEmpty && discoverState.nearbyBarbers.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.location_off_rounded, size: 64, color: AppColors.textSecondary),
                    const SizedBox(height: 16),
                    Text(
                      discoverState.error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 16),
                    ),
                    const SizedBox(height: 24),
                    TextButton(
                      onPressed: () {
                        ref.read(discoverControllerProvider.notifier).init();
                      },
                      child: const Text('Try Again', style: TextStyle(color: AppColors.gold)),
                    ),
                  ],
                ),
              ),
            )
          : AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              child: _showMap
                  ? const DiscoverMapView(key: ValueKey('map'))
                  : const FeedView(key: ValueKey('feed')),
            ),
    );
  }
}
