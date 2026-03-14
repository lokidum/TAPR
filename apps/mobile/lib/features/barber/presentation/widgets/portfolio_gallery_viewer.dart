import 'package:cached_network_image/cached_network_image.dart';
import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:tapr/core/constants/app_constants.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/barber/data/barber_profile_models.dart';
import 'package:video_player/video_player.dart';

class PortfolioGalleryViewer extends StatefulWidget {
  const PortfolioGalleryViewer({
    super.key,
    required this.items,
    required this.initialIndex,
    required this.barberId,
  });

  final List<PortfolioItemModel> items;
  final int initialIndex;
  final String barberId;

  static Future<void> show(
    BuildContext context,
    List<PortfolioItemModel> items,
    int initialIndex, {
    required String barberId,
  }) {
    return Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        pageBuilder: (_, __, ___) => PortfolioGalleryViewer(
          items: items,
          initialIndex: initialIndex,
          barberId: barberId,
        ),
        transitionsBuilder: (_, animation, __, child) {
          return FadeTransition(opacity: animation, child: child);
        },
      ),
    );
  }

  @override
  State<PortfolioGalleryViewer> createState() => _PortfolioGalleryViewerState();
}

class _PortfolioGalleryViewerState extends State<PortfolioGalleryViewer> {
  late PageController _pageController;
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(initialPage: widget.initialIndex);
    _currentIndex = widget.initialIndex;
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _share() {
    final item = widget.items[_currentIndex];
    final url =
        '${AppConstants.appBaseUrl}/barbers/${widget.barberId}/portfolio/${item.id}';
    Share.share(
      item.caption != null && item.caption!.isNotEmpty
          ? '${item.caption}\n\n$url'
          : url,
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.items[_currentIndex];

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: widget.items.length,
            onPageChanged: (i) => setState(() => _currentIndex = i),
            itemBuilder: (context, index) {
              return _PortfolioPage(item: widget.items[index]);
            },
          ),
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            right: 12,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  icon: const Icon(Icons.close_rounded,
                      color: AppColors.white, size: 28),
                  onPressed: () => Navigator.of(context).pop(),
                ),
                IconButton(
                  icon: const Icon(Icons.share_rounded,
                      color: AppColors.white, size: 28),
                  onPressed: _share,
                ),
              ],
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: MediaQuery.of(context).padding.bottom + 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (item.caption != null && item.caption!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        item.caption!,
                        style: AppTextStyles.body.copyWith(fontSize: 14),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  Row(
                    children: [
                      const Icon(Icons.visibility_rounded,
                          size: 16, color: AppColors.textSecondary),
                      const SizedBox(width: 4),
                      Text(
                        '${item.viewCount}',
                        style: AppTextStyles.caption
                            .copyWith(color: AppColors.white),
                      ),
                      const SizedBox(width: 16),
                      const Icon(Icons.favorite_rounded,
                          size: 16, color: AppColors.textSecondary),
                      const SizedBox(width: 4),
                      Text(
                        '${item.likeCount}',
                        style: AppTextStyles.caption
                            .copyWith(color: AppColors.white),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PortfolioPage extends StatefulWidget {
  const _PortfolioPage({required this.item});

  final PortfolioItemModel item;

  @override
  State<_PortfolioPage> createState() => _PortfolioPageState();
}

class _PortfolioPageState extends State<_PortfolioPage> {
  VideoPlayerController? _videoController;
  ChewieController? _chewieController;

  @override
  void initState() {
    super.initState();
    if (widget.item.mediaType == 'video') {
      _initVideo();
    }
  }

  void _initVideo() {
    _videoController = VideoPlayerController.networkUrl(
      Uri.parse(widget.item.cdnUrl),
    )..initialize().then((_) {
        if (!mounted) return;
        _chewieController = ChewieController(
          videoPlayerController: _videoController!,
          autoPlay: true,
          looping: true,
          showControls: true,
          aspectRatio: _videoController!.value.aspectRatio,
        );
        setState(() {});
      });
  }

  @override
  void dispose() {
    _chewieController?.dispose();
    _videoController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.item.mediaType == 'video') {
      if (_chewieController != null &&
          _videoController != null &&
          _videoController!.value.isInitialized) {
        return Center(
          child: AspectRatio(
            aspectRatio: _videoController!.value.aspectRatio,
            child: Chewie(controller: _chewieController!),
          ),
        );
      }
      return const Center(
        child: CircularProgressIndicator(color: AppColors.gold),
      );
    }

    return InteractiveViewer(
      minScale: 0.5,
      maxScale: 4.0,
      child: CachedNetworkImage(
        imageUrl: widget.item.cdnUrl,
        fit: BoxFit.contain,
        placeholder: (_, __) =>
            const Center(child: CircularProgressIndicator(color: AppColors.gold)),
        errorWidget: (_, __, ___) => const Center(
          child: Icon(
            Icons.broken_image_rounded,
            color: AppColors.textSecondary,
            size: 64,
          ),
        ),
      ),
    );
  }
}
