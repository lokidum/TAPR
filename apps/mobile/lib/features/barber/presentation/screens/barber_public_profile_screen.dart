import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:infinite_scroll_pagination/infinite_scroll_pagination.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/barber/data/barber_profile_models.dart';
import 'package:tapr/features/barber/data/barber_profile_repository.dart';
import 'package:tapr/features/barber/presentation/barber_profile_controller.dart';
import 'package:tapr/features/barber/presentation/widgets/portfolio_viewer.dart';
import 'package:tapr/shared/widgets/app_button.dart';
import 'package:tapr/shared/widgets/level_badge.dart';

class BarberPublicProfileScreen extends ConsumerStatefulWidget {
  const BarberPublicProfileScreen({super.key, required this.barberId});

  final String barberId;

  @override
  ConsumerState<BarberPublicProfileScreen> createState() =>
      _BarberPublicProfileScreenState();
}

class _BarberPublicProfileScreenState
    extends ConsumerState<BarberPublicProfileScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final PagingController<int, PortfolioItemModel> _portfolioPaging =
      PagingController(firstPageKey: 1);
  final PagingController<int, BarberReview> _reviewsPaging =
      PagingController(firstPageKey: 1);

  static const _pageSize = 20;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref
          .read(barberProfileControllerProvider.notifier)
          .loadProfile(widget.barberId);
    });

    _portfolioPaging.addPageRequestListener(_fetchPortfolioPage);
    _reviewsPaging.addPageRequestListener(_fetchReviewsPage);
  }

  Future<void> _fetchPortfolioPage(int pageKey) async {
    try {
      final repo = ref.read(barberProfileRepositoryProvider);
      final result = await repo.fetchPortfolio(
        widget.barberId,
        page: pageKey,
        limit: _pageSize,
      );
      final isLast =
          (pageKey - 1) * _pageSize + result.items.length >= result.total;
      if (isLast) {
        _portfolioPaging.appendLastPage(result.items);
      } else {
        _portfolioPaging.appendPage(result.items, pageKey + 1);
      }
    } catch (e) {
      _portfolioPaging.error = e;
    }
  }

  Future<void> _fetchReviewsPage(int pageKey) async {
    try {
      final repo = ref.read(barberProfileRepositoryProvider);
      final result = await repo.fetchReviews(
        widget.barberId,
        page: pageKey,
        limit: _pageSize,
      );
      final isLast =
          (pageKey - 1) * _pageSize + result.reviews.length >= result.total;
      if (isLast) {
        _reviewsPaging.appendLastPage(result.reviews);
      } else {
        _reviewsPaging.appendPage(result.reviews, pageKey + 1);
      }
    } catch (e) {
      _reviewsPaging.error = e;
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    _portfolioPaging.dispose();
    _reviewsPaging.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(barberProfileControllerProvider);

    if (state.isLoading && state.profile == null) {
      return const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: CircularProgressIndicator(color: AppColors.gold),
        ),
      );
    }

    if (state.error != null && state.profile == null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(backgroundColor: Colors.transparent, elevation: 0),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline_rounded,
                  size: 48, color: AppColors.textSecondary),
              const SizedBox(height: 12),
              Text(state.error!, style: AppTextStyles.bodySecondary),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => ref
                    .read(barberProfileControllerProvider.notifier)
                    .loadProfile(widget.barberId),
                child: const Text('Retry',
                    style: TextStyle(color: AppColors.gold)),
              ),
            ],
          ),
        ),
      );
    }

    final profile = state.profile!;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) {
          return [
            _buildSliverAppBar(profile),
            SliverToBoxAdapter(child: _buildProfileInfo(profile)),
            SliverToBoxAdapter(child: _buildStatsRow(profile)),
            SliverToBoxAdapter(child: _buildButtons(profile)),
            SliverPersistentHeader(
              pinned: true,
              delegate: _TabBarDelegate(
                TabBar(
                  controller: _tabController,
                  indicatorColor: AppColors.gold,
                  labelColor: AppColors.gold,
                  unselectedLabelColor: AppColors.textSecondary,
                  tabs: const [
                    Tab(text: 'Portfolio'),
                    Tab(text: 'Reviews'),
                  ],
                ),
              ),
            ),
          ];
        },
        body: TabBarView(
          controller: _tabController,
          children: [
            _buildPortfolioTab(),
            _buildReviewsTab(),
          ],
        ),
      ),
    );
  }

  SliverAppBar _buildSliverAppBar(BarberProfileDetail profile) {
    return SliverAppBar(
      expandedHeight: 220,
      pinned: true,
      backgroundColor: AppColors.surface,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_rounded, color: AppColors.white),
        onPressed: () => Navigator.of(context).pop(),
      ),
      flexibleSpace: FlexibleSpaceBar(
        background: Stack(
          fit: StackFit.expand,
          children: [
            _buildCoverImage(),
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black54],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCoverImage() {
    final items = _portfolioPaging.itemList;
    if (items != null && items.isNotEmpty) {
      final coverUrl = items.first.thumbnailUrl ?? items.first.cdnUrl;
      return CachedNetworkImage(
        imageUrl: coverUrl,
        fit: BoxFit.cover,
        placeholder: (_, __) => _buildGoldGradient(),
        errorWidget: (_, __, ___) => _buildGoldGradient(),
      );
    }
    return _buildGoldGradient();
  }

  Widget _buildGoldGradient() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.goldMuted, AppColors.gold],
        ),
      ),
    );
  }

  Widget _buildProfileInfo(BarberProfileDetail profile) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 40,
                backgroundColor: AppColors.gold,
                backgroundImage: profile.user.avatarUrl != null
                    ? CachedNetworkImageProvider(profile.user.avatarUrl!)
                    : null,
                child: profile.user.avatarUrl == null
                    ? Text(
                        profile.user.fullName.isNotEmpty
                            ? profile.user.fullName[0].toUpperCase()
                            : '?',
                        style: AppTextStyles.h1
                            .copyWith(color: AppColors.background),
                      )
                    : null,
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(profile.user.fullName, style: AppTextStyles.h2),
                    const SizedBox(height: 4),
                    LevelBadge(level: profile.level, title: profile.title),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        ...List.generate(5, (i) {
                          return Icon(
                            i < profile.averageRating.round()
                                ? Icons.star_rounded
                                : Icons.star_border_rounded,
                            color: AppColors.gold,
                            size: 18,
                          );
                        }),
                        const SizedBox(width: 6),
                        Text(
                          '${profile.averageRating.toStringAsFixed(1)} (${profile.totalRatings})',
                          style: AppTextStyles.caption,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (profile.bio != null && profile.bio!.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(profile.bio!, style: AppTextStyles.bodySecondary),
          ],
        ],
      ),
    );
  }

  Widget _buildStatsRow(BarberProfileDetail profile) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Row(
        children: [
          _StatItem(
            label: 'Verified Cuts',
            value: profile.totalVerifiedCuts.toString(),
          ),
          const _StatDivider(),
          _StatItem(
            label: 'Avg Rating',
            value: profile.averageRating > 0
                ? profile.averageRating.toStringAsFixed(1)
                : 'New',
          ),
          const _StatDivider(),
          const _StatItem(label: 'Response', value: 'N/A'),
        ],
      ),
    );
  }

  Widget _buildButtons(BarberProfileDetail profile) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
      child: Row(
        children: [
          Expanded(
            child: AppButton(
              label: 'Book Now',
              onPressed: () => context.push('/book/${profile.id}'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: OutlinedButton(
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Messaging coming soon'),
                    duration: Duration(seconds: 2),
                  ),
                );
              },
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.gold,
                side: const BorderSide(color: AppColors.gold),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text('Message'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPortfolioTab() {
    return PagedGridView<int, PortfolioItemModel>(
      pagingController: _portfolioPaging,
      padding: const EdgeInsets.all(2),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 2,
        crossAxisSpacing: 2,
      ),
      builderDelegate: PagedChildBuilderDelegate<PortfolioItemModel>(
        itemBuilder: (context, item, index) {
          return GestureDetector(
            onTap: () => PortfolioViewer.show(context, item),
            child: Stack(
              fit: StackFit.expand,
              children: [
                CachedNetworkImage(
                  imageUrl: item.thumbnailUrl ?? item.cdnUrl,
                  fit: BoxFit.cover,
                  placeholder: (_, __) =>
                      Container(color: AppColors.surface),
                  errorWidget: (_, __, ___) => Container(
                    color: AppColors.surface,
                    child: const Icon(Icons.broken_image_rounded,
                        color: AppColors.textSecondary),
                  ),
                ),
                if (item.mediaType == 'video')
                  const Positioned(
                    top: 6,
                    right: 6,
                    child: Icon(Icons.play_circle_fill_rounded,
                        color: AppColors.white, size: 20),
                  ),
              ],
            ),
          );
        },
        firstPageProgressIndicatorBuilder: (_) => const Center(
          child: CircularProgressIndicator(color: AppColors.gold),
        ),
        noItemsFoundIndicatorBuilder: (_) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.photo_library_outlined,
                  size: 48,
                  color: AppColors.textSecondary.withValues(alpha: 0.5)),
              const SizedBox(height: 8),
              Text('No portfolio items yet',
                  style: AppTextStyles.bodySecondary),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReviewsTab() {
    return PagedListView<int, BarberReview>(
      pagingController: _reviewsPaging,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      builderDelegate: PagedChildBuilderDelegate<BarberReview>(
        itemBuilder: (context, review, index) {
          return _ReviewCard(review: review);
        },
        firstPageProgressIndicatorBuilder: (_) => const Center(
          child: CircularProgressIndicator(color: AppColors.gold),
        ),
        noItemsFoundIndicatorBuilder: (_) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.rate_review_outlined,
                  size: 48,
                  color: AppColors.textSecondary.withValues(alpha: 0.5)),
              const SizedBox(height: 8),
              Text('No reviews yet', style: AppTextStyles.bodySecondary),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  const _StatItem({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: AppTextStyles.h3),
          const SizedBox(height: 2),
          Text(label, style: AppTextStyles.caption),
        ],
      ),
    );
  }
}

class _StatDivider extends StatelessWidget {
  const _StatDivider();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 32,
      color: AppColors.divider,
    );
  }
}

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  const _TabBarDelegate(this.tabBar);

  final TabBar tabBar;

  @override
  double get minExtent => tabBar.preferredSize.height;

  @override
  double get maxExtent => tabBar.preferredSize.height;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: AppColors.background,
      child: tabBar,
    );
  }

  @override
  bool shouldRebuild(covariant _TabBarDelegate oldDelegate) => false;
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review});

  final BarberReview review;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: AppColors.goldMuted,
                backgroundImage: review.consumer.avatarUrl != null
                    ? CachedNetworkImageProvider(review.consumer.avatarUrl!)
                    : null,
                child: review.consumer.avatarUrl == null
                    ? Text(
                        review.consumer.firstName.isNotEmpty
                            ? review.consumer.firstName[0].toUpperCase()
                            : '?',
                        style: AppTextStyles.body
                            .copyWith(color: AppColors.white, fontSize: 14),
                      )
                    : null,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(review.consumer.firstName,
                        style: AppTextStyles.body
                            .copyWith(fontWeight: FontWeight.w600)),
                    Text(_formatDate(review.reviewedAt),
                        style: AppTextStyles.caption),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _RatingPill(label: 'Cut', rating: review.cutRating),
              const SizedBox(width: 8),
              _RatingPill(
                  label: 'Experience', rating: review.experienceRating),
            ],
          ),
          if (review.reviewText != null &&
              review.reviewText!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(review.reviewText!, style: AppTextStyles.bodySecondary),
          ],
        ],
      ),
    );
  }

  String _formatDate(String isoDate) {
    try {
      final date = DateTime.parse(isoDate);
      final now = DateTime.now();
      final diff = now.difference(date);
      if (diff.inDays == 0) return 'Today';
      if (diff.inDays == 1) return 'Yesterday';
      if (diff.inDays < 7) return '${diff.inDays} days ago';
      if (diff.inDays < 30) return '${(diff.inDays / 7).floor()} weeks ago';
      if (diff.inDays < 365) return '${(diff.inDays / 30).floor()} months ago';
      return '${(diff.inDays / 365).floor()} years ago';
    } catch (_) {
      return '';
    }
  }
}

class _RatingPill extends StatelessWidget {
  const _RatingPill({required this.label, required this.rating});

  final String label;
  final int rating;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.gold.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('$label ', style: AppTextStyles.caption.copyWith(fontSize: 11)),
          ...List.generate(5, (i) {
            return Icon(
              i < rating ? Icons.star_rounded : Icons.star_border_rounded,
              color: AppColors.gold,
              size: 12,
            );
          }),
        ],
      ),
    );
  }
}
