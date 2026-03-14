import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/barber/data/barber_portfolio_models.dart';
import 'package:tapr/features/barber/data/barber_portfolio_repository.dart';
import 'package:tapr/features/barber/data/barber_profile_models.dart';
import 'package:tapr/features/barber/data/barber_profile_repository.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/features/barber/presentation/widgets/portfolio_viewer.dart';
import 'package:tapr/shared/widgets/app_button.dart';

class PortfolioScreen extends ConsumerStatefulWidget {
  const PortfolioScreen({super.key});

  @override
  ConsumerState<PortfolioScreen> createState() => _PortfolioScreenState();
}

class _PortfolioScreenState extends ConsumerState<PortfolioScreen> {
  BarberProfileDetail? _profile;
  PortfolioStats? _stats;
  List<PortfolioItemModel> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profileRepo = ref.read(barberProfileRepositoryProvider);
      final portfolioRepo = ref.read(barberPortfolioRepositoryProvider);

      final profile = await profileRepo.fetchMyProfile();
      if (!mounted) return;

      final stats = await portfolioRepo.fetchStats();
      if (!mounted) return;

      final result = await portfolioRepo.fetchMyPortfolio(profile.id);
      if (!mounted) return;

      setState(() {
        _profile = profile;
        _stats = stats;
        _items = result.items;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString();
        });
      }
    }
  }

  void _showAddContentSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Add Content', style: AppTextStyles.h3),
              const SizedBox(height: 20),
              ListTile(
                leading: const Icon(Icons.videocam_rounded, color: AppColors.gold),
                title: const Text('Record Video'),
                onTap: () {
                  Navigator.pop(ctx);
                  _pickMedia(ImageSource.camera, isVideo: true);
                },
              ),
              ListTile(
                leading: const Icon(Icons.video_file_rounded, color: AppColors.gold),
                title: const Text('Upload Video'),
                onTap: () {
                  Navigator.pop(ctx);
                  _pickMedia(ImageSource.gallery, isVideo: true);
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_rounded, color: AppColors.gold),
                title: const Text('Upload Photo'),
                onTap: () {
                  Navigator.pop(ctx);
                  _pickMedia(ImageSource.gallery, isVideo: false);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickMedia(ImageSource source, {required bool isVideo}) async {
    final picker = ImagePicker();
    if (isVideo) {
      final file = await picker.pickVideo(source: source);
      if (file != null && mounted) _showUploadPreview(file, 'video');
    } else {
      final file = await picker.pickImage(source: source);
      if (file != null && mounted) _showUploadPreview(file, 'image');
    }
  }

  Future<void> _showUploadPreview(dynamic file, String mediaType) async {
    final bytes = await file.readAsBytes();
    final fileName = file.name;
    final mimeType = _mimeTypeFromFileName(fileName, mediaType);

    if (!mounted) return;
    final captionController = TextEditingController();

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 24,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Add caption (optional)', style: AppTextStyles.body),
            const SizedBox(height: 8),
            TextField(
              controller: captionController,
              maxLines: 2,
              decoration: const InputDecoration(
                hintText: 'Describe your work...',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            AppButton(
              label: 'Upload',
              onPressed: () async {
                Navigator.pop(ctx);
                await _upload(
                  bytes: bytes,
                  fileName: fileName,
                  mimeType: mimeType,
                  mediaType: mediaType,
                  caption: captionController.text.trim(),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _upload({
    required List<int> bytes,
    required String fileName,
    required String mimeType,
    required String mediaType,
    required String caption,
  }) async {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          backgroundColor: AppColors.surface,
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(color: AppColors.gold),
              const SizedBox(height: 16),
              Text('Uploading...', style: AppTextStyles.body),
            ],
          ),
        ),
      ),
    );
    try {
      final portfolioRepo = ref.read(barberPortfolioRepositoryProvider);
      final dio = ref.read(dioProvider);

      final result = await portfolioRepo.getUploadUrl(
        fileName: fileName,
        mimeType: mimeType,
        mediaType: mediaType,
      );

      await dio.put<dynamic>(
        result.uploadUrl,
        data: bytes,
        options: Options(
          contentType: mimeType,
          headers: {'Content-Type': mimeType},
        ),
      );

      await portfolioRepo.createPortfolioItem(
        key: result.key,
        mediaType: mediaType,
        caption: caption.isEmpty ? null : caption,
      );

      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Upload complete')),
      );

      if (mediaType == 'video') {
        _showSyncComingSoon();
      }
      _load();
    } catch (e) {
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e')),
        );
      }
    }
  }

  String _mimeTypeFromFileName(String fileName, String mediaType) {
    final lower = fileName.toLowerCase();
    if (mediaType == 'video') {
      if (lower.endsWith('.mov')) return 'video/quicktime';
      return 'video/mp4';
    }
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  void _showSyncComingSoon() {
    // TODO: Sync endpoint needs Instagram/TikTok API credentials and platform app review before it can be implemented.
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Coming Soon — connect your Instagram in Profile settings',
        ),
      ),
    );
  }

  void _showItemOptions(PortfolioItemModel item) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ListTile(
                leading: const Icon(Icons.star_rounded, color: AppColors.gold),
                title: Text(item.isFeatured ? 'Unset Featured' : 'Set as Featured'),
                onTap: () {
                  Navigator.pop(ctx);
                  _setFeatured(item);
                },
              ),
              ListTile(
                leading: const Icon(Icons.edit_rounded, color: AppColors.gold),
                title: const Text('Edit Caption'),
                onTap: () {
                  Navigator.pop(ctx);
                  _editCaption(item);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_rounded, color: AppColors.error),
                title: const Text('Delete'),
                onTap: () {
                  Navigator.pop(ctx);
                  _deleteItem(item);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _setFeatured(PortfolioItemModel item) async {
    try {
      await ref.read(barberPortfolioRepositoryProvider).updatePortfolioItem(
            item.id,
            isFeatured: !item.isFeatured,
          );
      if (mounted) _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e')),
        );
      }
    }
  }

  Future<void> _editCaption(PortfolioItemModel item) async {
    final controller = TextEditingController(text: item.caption ?? '');
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Edit Caption'),
        content: TextField(
          controller: controller,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Caption',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (result == null || !mounted) return;
    try {
      await ref.read(barberPortfolioRepositoryProvider).updatePortfolioItem(
            item.id,
            caption: result,
          );
      if (mounted) _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e')),
        );
      }
    }
  }

  Future<void> _deleteItem(PortfolioItemModel item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Delete item?'),
        content: const Text(
          'This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref.read(barberPortfolioRepositoryProvider).deletePortfolioItem(item.id);
      if (mounted) {
        _load();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Item deleted')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e')),
        );
      }
    }
  }

  void _openViewer(int index) {
    PortfolioViewer.showGallery(
      context,
      _items,
      index,
      barberId: _profile!.id,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _profile == null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(backgroundColor: Colors.transparent, elevation: 0),
        body: const Center(
          child: CircularProgressIndicator(color: AppColors.gold),
        ),
      );
    }

    if (_error != null && _profile == null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(backgroundColor: Colors.transparent, elevation: 0),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, style: AppTextStyles.bodySecondary),
              const SizedBox(height: 16),
              TextButton(
                onPressed: _load,
                child: const Text('Retry', style: TextStyle(color: AppColors.gold)),
              ),
            ],
          ),
        ),
      );
    }

    final stats = _stats ?? const PortfolioStats(totalItems: 0, totalViews: 0, totalLikes: 0);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text('Portfolio', style: AppTextStyles.h2),
      ),
      body: RefreshIndicator(
        color: AppColors.gold,
        onRefresh: _load,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Row(
                  children: [
                    Expanded(
                      child: _StatCard(
                        label: 'Items',
                        value: stats.totalItems.toString(),
                        icon: Icons.photo_library_rounded,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _StatCard(
                        label: 'Views',
                        value: stats.totalViews.toString(),
                        icon: Icons.visibility_rounded,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _StatCard(
                        label: 'Likes',
                        value: stats.totalLikes.toString(),
                        icon: Icons.favorite_rounded,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: _items.isEmpty
                  ? SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.photo_library_outlined,
                              size: 48,
                              color: AppColors.textSecondary.withValues(alpha: 0.5),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'No portfolio items yet',
                              style: AppTextStyles.bodySecondary,
                            ),
                          ],
                        ),
                      ),
                    )
                  : SliverGrid(
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 4,
                        crossAxisSpacing: 4,
                        childAspectRatio: 1,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          final item = _items[index];
                          return GestureDetector(
                            onTap: () => _openViewer(index),
                            onLongPress: () => _showItemOptions(item),
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
                                    child: const Icon(
                                      Icons.broken_image_rounded,
                                      color: AppColors.textSecondary,
                                    ),
                                  ),
                                ),
                                if (item.mediaType == 'video')
                                  const Positioned(
                                    top: 6,
                                    right: 6,
                                    child: Icon(
                                      Icons.play_circle_fill_rounded,
                                      color: AppColors.white,
                                      size: 20,
                                    ),
                                  ),
                              ],
                            ),
                          );
                        },
                        childCount: _items.length,
                      ),
                    ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddContentSheet,
        backgroundColor: AppColors.gold,
        child: const Icon(Icons.add_rounded, color: AppColors.background),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Icon(icon, color: AppColors.gold, size: 24),
          const SizedBox(height: 4),
          Text(value, style: AppTextStyles.h3),
          Text(label, style: AppTextStyles.caption),
        ],
      ),
    );
  }
}
