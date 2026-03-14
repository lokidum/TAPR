import 'package:cached_network_image/cached_network_image.dart';
import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/discover/data/discover_models.dart';
import 'package:tapr/shared/widgets/level_badge.dart';
import 'package:video_player/video_player.dart';

class PortfolioFeedItem extends StatefulWidget {
  const PortfolioFeedItem({
    super.key,
    required this.item,
    required this.isLiked,
    required this.onLike,
    required this.onShare,
    required this.onBarberTap,
    this.isActive = false,
  });

  final FeedItem item;
  final bool isLiked;
  final VoidCallback onLike;
  final VoidCallback onShare;
  final VoidCallback onBarberTap;
  final bool isActive;

  @override
  State<PortfolioFeedItem> createState() => _PortfolioFeedItemState();
}

class _PortfolioFeedItemState extends State<PortfolioFeedItem>
    with SingleTickerProviderStateMixin {
  VideoPlayerController? _videoController;
  ChewieController? _chewieController;
  bool _showHeart = false;
  late final AnimationController _heartAnimController;
  late final Animation<double> _heartScale;
  late final Animation<double> _heartOpacity;

  @override
  void initState() {
    super.initState();
    _heartAnimController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _heartScale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.2), weight: 30),
      TweenSequenceItem(tween: Tween(begin: 1.2, end: 1.0), weight: 20),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.0), weight: 50),
    ]).animate(_heartAnimController);
    _heartOpacity = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0), weight: 20),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.0), weight: 50),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0), weight: 30),
    ]).animate(_heartAnimController);

    _heartAnimController.addStatusListener((status) {
      if (status == AnimationStatus.completed && mounted) {
        setState(() => _showHeart = false);
      }
    });

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
          autoPlay: widget.isActive,
          looping: true,
          showControls: false,
          showOptions: false,
          aspectRatio: _videoController!.value.aspectRatio,
        );
        setState(() {});
      });
  }

  @override
  void didUpdateWidget(covariant PortfolioFeedItem oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive != oldWidget.isActive) {
      if (widget.isActive) {
        _videoController?.play();
      } else {
        _videoController?.pause();
      }
    }
  }

  @override
  void dispose() {
    _heartAnimController.dispose();
    _chewieController?.dispose();
    _videoController?.dispose();
    super.dispose();
  }

  void _onDoubleTap() {
    if (!widget.isLiked) {
      widget.onLike();
    }
    setState(() => _showHeart = true);
    _heartAnimController.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onDoubleTap: _onDoubleTap,
      child: Stack(
        fit: StackFit.expand,
        children: [
          _buildMedia(),
          _buildBottomOverlay(),
          _buildRightOverlay(),
          if (_showHeart) _buildHeartAnimation(),
        ],
      ),
    );
  }

  Widget _buildMedia() {
    if (widget.item.mediaType == 'video') {
      if (_chewieController != null &&
          _videoController!.value.isInitialized) {
        return FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(
            width: _videoController!.value.size.width,
            height: _videoController!.value.size.height,
            child: Chewie(controller: _chewieController!),
          ),
        );
      }
      return _buildThumbnailOrShimmer();
    }

    return CachedNetworkImage(
      imageUrl: widget.item.cdnUrl,
      fit: BoxFit.cover,
      placeholder: (_, __) => _buildShimmer(),
      errorWidget: (_, __, ___) => Container(
        color: AppColors.surface,
        child: const Center(
          child: Icon(Icons.broken_image_rounded, color: AppColors.textSecondary, size: 48),
        ),
      ),
    );
  }

  Widget _buildThumbnailOrShimmer() {
    if (widget.item.thumbnailUrl != null) {
      return CachedNetworkImage(
        imageUrl: widget.item.thumbnailUrl!,
        fit: BoxFit.cover,
        placeholder: (_, __) => _buildShimmer(),
        errorWidget: (_, __, ___) => _buildShimmer(),
      );
    }
    return _buildShimmer();
  }

  Widget _buildShimmer() {
    return Container(
      color: AppColors.surface,
      child: Center(
        child: SizedBox(
          width: 40,
          height: 40,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppColors.gold.withValues(alpha: 0.5),
          ),
        ),
      ),
    );
  }

  Widget _buildBottomOverlay() {
    final barber = widget.item.barber;
    return Positioned(
      left: 0,
      right: 72,
      bottom: 0,
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.bottomCenter,
            end: Alignment.topCenter,
            colors: [
              Colors.black87,
              Colors.transparent,
            ],
            stops: [0.0, 1.0],
          ),
        ),
        padding: const EdgeInsets.fromLTRB(16, 48, 16, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              barber.fullName,
              style: AppTextStyles.h3,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                LevelBadge(level: barber.level, title: barber.title),
                const SizedBox(width: 8),
                Text(
                  '${barber.distanceKm.toStringAsFixed(1)} km',
                  style: AppTextStyles.caption.copyWith(color: AppColors.white.withValues(alpha: 0.7)),
                ),
              ],
            ),
            if (widget.item.caption != null && widget.item.caption!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                widget.item.caption!,
                style: AppTextStyles.bodySecondary.copyWith(
                  fontSize: 14,
                  color: AppColors.white.withValues(alpha: 0.8),
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildRightOverlay() {
    final barber = widget.item.barber;
    return Positioned(
      right: 12,
      bottom: 100,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          GestureDetector(
            onTap: widget.onBarberTap,
            child: CircleAvatar(
              radius: 22,
              backgroundColor: AppColors.gold,
              backgroundImage:
                  barber.avatarUrl != null ? CachedNetworkImageProvider(barber.avatarUrl!) : null,
              child: barber.avatarUrl == null
                  ? Text(
                      barber.fullName.isNotEmpty ? barber.fullName[0].toUpperCase() : '?',
                      style: AppTextStyles.h3.copyWith(color: AppColors.background),
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 20),
          _OverlayButton(
            icon: widget.isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
            label: _formatCount(widget.item.likeCount),
            color: widget.isLiked ? AppColors.gold : AppColors.white,
            onTap: widget.onLike,
          ),
          const SizedBox(height: 16),
          _OverlayButton(
            icon: Icons.share_rounded,
            label: 'Share',
            color: AppColors.white,
            onTap: widget.onShare,
          ),
        ],
      ),
    );
  }

  Widget _buildHeartAnimation() {
    return Center(
      child: AnimatedBuilder(
        animation: _heartAnimController,
        builder: (_, __) {
          return Opacity(
            opacity: _heartOpacity.value,
            child: Transform.scale(
              scale: _heartScale.value,
              child: const Icon(
                Icons.favorite_rounded,
                size: 100,
                color: AppColors.gold,
              ),
            ),
          );
        },
      ),
    );
  }

  String _formatCount(int count) {
    if (count >= 1000000) return '${(count / 1000000).toStringAsFixed(1)}M';
    if (count >= 1000) return '${(count / 1000).toStringAsFixed(1)}K';
    return count.toString();
  }
}

class _OverlayButton extends StatelessWidget {
  const _OverlayButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 32),
          const SizedBox(height: 2),
          Text(
            label,
            style: AppTextStyles.caption.copyWith(color: color, fontSize: 11),
          ),
        ],
      ),
    );
  }
}
