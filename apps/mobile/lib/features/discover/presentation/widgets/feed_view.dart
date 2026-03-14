import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/discover/presentation/discover_controller.dart';
import 'package:tapr/features/discover/presentation/widgets/portfolio_feed_item.dart';

class FeedView extends ConsumerStatefulWidget {
  const FeedView({super.key});

  @override
  ConsumerState<FeedView> createState() => _FeedViewState();
}

class _FeedViewState extends ConsumerState<FeedView> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(discoverControllerProvider);

    if (state.isLoadingFeed && state.feedItems.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.gold),
      );
    }

    if (state.feedItems.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.content_cut_rounded,
              size: 64,
              color: AppColors.textSecondary.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 16),
            Text('No barbers nearby', style: AppTextStyles.h3),
            const SizedBox(height: 8),
            Text(
              'Try expanding your search area',
              style: AppTextStyles.bodySecondary,
            ),
          ],
        ),
      );
    }

    return PageView.builder(
      controller: _pageController,
      scrollDirection: Axis.vertical,
      itemCount: state.feedItems.length,
      onPageChanged: (index) {
        setState(() => _currentPage = index);
        if (index >= state.feedItems.length - 3) {
          ref.read(discoverControllerProvider.notifier).loadMoreFeed();
        }
      },
      itemBuilder: (context, index) {
        final item = state.feedItems[index];
        final isLiked = state.likedItemIds.contains(item.id);

        return PortfolioFeedItem(
          item: item,
          isLiked: isLiked,
          isActive: index == _currentPage,
          onLike: () {
            ref.read(discoverControllerProvider.notifier).toggleLike(item);
          },
          onShare: () {
            // Share functionality placeholder
          },
          onBarberTap: () {
            context.push('/barbers/${item.barber.userId}');
          },
        );
      },
    );
  }
}
