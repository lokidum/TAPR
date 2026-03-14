import 'package:cached_network_image/cached_network_image.dart';
import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:tapr/features/barber/presentation/widgets/portfolio_gallery_viewer.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/barber/data/barber_profile_models.dart';
import 'package:video_player/video_player.dart';

class PortfolioViewer extends StatefulWidget {
  const PortfolioViewer({super.key, required this.item});

  final PortfolioItemModel item;

  static Future<void> showGallery(
    BuildContext context,
    List<PortfolioItemModel> items,
    int initialIndex, {
    required String barberId,
  }) {
    return PortfolioGalleryViewer.show(
      context,
      items,
      initialIndex,
      barberId: barberId,
    );
  }

  static Future<void> show(BuildContext context, PortfolioItemModel item) {
    return Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        pageBuilder: (_, __, ___) => PortfolioViewer(item: item),
        transitionsBuilder: (_, animation, __, child) {
          return FadeTransition(opacity: animation, child: child);
        },
      ),
    );
  }

  @override
  State<PortfolioViewer> createState() => _PortfolioViewerState();
}

class _PortfolioViewerState extends State<PortfolioViewer> {
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
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          Center(child: _buildContent()),
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 12,
            child: IconButton(
              icon: const Icon(Icons.close_rounded, color: AppColors.white, size: 28),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
          if (widget.item.caption != null && widget.item.caption!.isNotEmpty)
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
                child: Text(
                  widget.item.caption!,
                  style: AppTextStyles.body.copyWith(fontSize: 14),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    if (widget.item.mediaType == 'video') {
      if (_chewieController != null && _videoController!.value.isInitialized) {
        return AspectRatio(
          aspectRatio: _videoController!.value.aspectRatio,
          child: Chewie(controller: _chewieController!),
        );
      }
      return const CircularProgressIndicator(color: AppColors.gold);
    }

    return InteractiveViewer(
      minScale: 0.5,
      maxScale: 4.0,
      child: CachedNetworkImage(
        imageUrl: widget.item.cdnUrl,
        fit: BoxFit.contain,
        placeholder: (_, __) =>
            const CircularProgressIndicator(color: AppColors.gold),
        errorWidget: (_, __, ___) => const Icon(
          Icons.broken_image_rounded,
          color: AppColors.textSecondary,
          size: 64,
        ),
      ),
    );
  }
}
