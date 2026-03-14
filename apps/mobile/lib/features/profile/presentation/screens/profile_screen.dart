import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:tapr/core/constants/app_constants.dart';
import 'package:tapr/core/network/api_client.dart';
import 'package:tapr/core/theme/app_colors.dart';
import 'package:tapr/core/theme/app_text_styles.dart';
import 'package:tapr/features/auth/auth_notifier.dart';
import 'package:tapr/features/barber/data/barber_profile_repository.dart';
import 'package:tapr/features/profile/data/profile_models.dart';
import 'package:tapr/features/profile/data/profile_repository.dart';
import 'package:tapr/features/profile/presentation/widgets/stripe_onboarding_webview.dart';
import 'package:tapr/features/studio/data/studio_repository.dart';
import 'package:tapr/shared/widgets/app_button.dart';

const _notificationsKey = 'profile_notifications_enabled';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  ProfileData? _profile;
  bool _loading = true;
  String? _error;
  bool _notificationsEnabled = true;

  @override
  void initState() {
    super.initState();
    _loadNotificationsPref();
    _load();
  }

  Future<void> _loadNotificationsPref() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _notificationsEnabled = prefs.getBool(_notificationsKey) ?? true;
    });
  }

  Future<void> _saveNotificationsPref(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_notificationsKey, value);
    setState(() => _notificationsEnabled = value);
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profileRepo = ref.read(profileRepositoryProvider);
      final data = await profileRepo.fetchMe();
      if (mounted) {
        setState(() {
          _profile = data;
          _loading = false;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString();
        });
      }
    }
  }

  Future<void> _uploadAvatar() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: ImageSource.gallery);
    if (file == null || !mounted) return;

    final fileName = file.name;
    final mimeType = 'image/${fileName.split('.').last.toLowerCase()}';
    if (mimeType != 'image/jpeg' && mimeType != 'image/png' && mimeType != 'image/webp') {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please use JPEG, PNG, or WebP')),
        );
      }
      return;
    }

    try {
      final profileRepo = ref.read(profileRepositoryProvider);
      final dio = ref.read(dioProvider);
      final result = await profileRepo.fetchAvatarUploadUrl(fileName, mimeType);
      final bytes = await file.readAsBytes();

      await dio.put<dynamic>(
        result.uploadUrl,
        data: bytes,
        options: Options(
          contentType: mimeType,
          headers: {'Content-Type': mimeType},
        ),
      );

      await profileRepo.updateMe(avatarUrl: result.cdnUrl);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e')),
        );
      }
    }
  }

  Future<void> _saveFullName(String name) async {
    if (name.trim().isEmpty) return;
    try {
      await ref.read(profileRepositoryProvider).updateMe(fullName: name.trim());
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e')),
        );
      }
    }
  }

  Future<void> _handleLogout() async {
    try {
      await ref.read(profileRepositoryProvider).logout();
    } catch (_) {}
    if (mounted) {
      ref.read(authNotifierProvider.notifier).setUnauthenticated();
      context.go('/auth/welcome');
    }
  }

  Future<void> _handleDeleteAccount() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Delete Account'),
        content: const Text(
          'Are you sure? This action cannot be undone. Your data will be permanently removed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref.read(profileRepositoryProvider).deleteAccount();
      if (mounted) {
        ref.read(authNotifierProvider.notifier).setUnauthenticated();
        context.go('/auth/welcome');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete account: $e')),
        );
      }
    }
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(color: AppColors.gold),
              const SizedBox(height: 16),
              Text('Loading...', style: AppTextStyles.bodySecondary),
            ],
          ),
        ),
      );
    }

    if (_error != null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(title: const Text('Profile')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, style: AppTextStyles.bodySecondary, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              AppButton(label: 'Retry', onPressed: _load, isExpanded: false),
            ],
          ),
        ),
      );
    }

    final profile = _profile!;
    final role = profile.user.role;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: AppColors.background,
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        color: AppColors.gold,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildAvatarSection(profile),
              const SizedBox(height: 24),
              _buildNameSection(profile),
              const SizedBox(height: 16),
              _buildBadge(role),
              const SizedBox(height: 32),
              _buildSettingsSection(),
              const SizedBox(height: 32),
              if (role == 'barber' && profile.barberProfile != null)
                _buildBarberSection(profile.barberProfile!),
              if (role == 'studio' && profile.studioProfile != null)
                _buildStudioSection(profile.studioProfile!),
              const SizedBox(height: 32),
              _buildLogoutButton(),
              const SizedBox(height: 16),
              _buildDeleteButton(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAvatarSection(ProfileData profile) {
    return Center(
      child: Stack(
        children: [
          CircleAvatar(
            radius: 48,
            backgroundColor: AppColors.surface,
            backgroundImage: profile.user.avatarUrl != null
                ? CachedNetworkImageProvider(profile.user.avatarUrl!)
                : null,
            child: profile.user.avatarUrl == null
                ? Text(
                    profile.user.fullName.isNotEmpty
                        ? profile.user.fullName[0].toUpperCase()
                        : '?',
                    style: AppTextStyles.h1.copyWith(fontSize: 32),
                  )
                : null,
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: GestureDetector(
              onTap: _uploadAvatar,
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: const BoxDecoration(
                  color: AppColors.gold,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.camera_alt, size: 20, color: AppColors.background),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNameSection(ProfileData profile) {
    return TextField(
      controller: TextEditingController(text: profile.user.fullName)
        ..selection = TextSelection.collapsed(offset: profile.user.fullName.length),
      style: AppTextStyles.h2,
      textAlign: TextAlign.center,
      decoration: const InputDecoration(
        border: InputBorder.none,
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      ),
      onSubmitted: _saveFullName,
    );
  }

  Widget _buildBadge(String role) {
    final label = role == 'barber'
        ? 'Barber'
        : role == 'studio'
            ? 'Studio'
            : 'Consumer';
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.gold.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label, style: AppTextStyles.label),
      ),
    );
  }

  Widget _buildSettingsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Settings', style: AppTextStyles.h3),
        const SizedBox(height: 12),
        ListTile(
          title: const Text('Notifications'),
          trailing: Switch(
            value: _notificationsEnabled,
            onChanged: _saveNotificationsPref,
            activeThumbColor: AppColors.gold,
          ),
        ),
        ListTile(
          title: const Text('Privacy'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Coming soon')),
            );
          },
        ),
        ListTile(
          title: const Text('Support'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => _launchUrl(AppConstants.supportUrl),
        ),
        ListTile(
          title: const Text('Terms of Service'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => _launchUrl(AppConstants.termsUrl),
        ),
        ListTile(
          title: const Text('Privacy Policy'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => _launchUrl(AppConstants.privacyPolicyUrl),
        ),
      ],
    );
  }

  Widget _buildBarberSection(ProfileBarberData barber) {
    return _BarberProfileForm(
      barber: barber,
      onSaved: _load,
    );
  }

  Widget _buildStudioSection(ProfileStudioData studio) {
    return _StudioProfileForm(
      studio: studio,
      onSaved: _load,
    );
  }

  Widget _buildLogoutButton() {
    return AppButton(
      label: 'Log Out',
      onPressed: _handleLogout,
      icon: Icons.logout,
    );
  }

  Widget _buildDeleteButton() {
    return TextButton(
      onPressed: _handleDeleteAccount,
      child: Text(
        'Delete Account',
        style: AppTextStyles.body.copyWith(color: AppColors.error),
      ),
    );
  }
}

class _BarberProfileForm extends ConsumerStatefulWidget {
  const _BarberProfileForm({
    required this.barber,
    required this.onSaved,
  });

  final ProfileBarberData barber;
  final VoidCallback onSaved;

  @override
  ConsumerState<_BarberProfileForm> createState() => _BarberProfileFormState();
}

class _BarberProfileFormState extends ConsumerState<_BarberProfileForm> {
  late TextEditingController _abnController;
  late TextEditingController _instagramController;
  late TextEditingController _tiktokController;
  late double _radiusValue;

  @override
  void initState() {
    super.initState();
    _abnController = TextEditingController(text: widget.barber.abn ?? '');
    _instagramController = TextEditingController(text: widget.barber.instagramHandle ?? '');
    _tiktokController = TextEditingController(text: widget.barber.tiktokHandle ?? '');
    _radiusValue = widget.barber.serviceRadiusKm.toDouble();
  }

  @override
  void didUpdateWidget(covariant _BarberProfileForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.barber.id != widget.barber.id) {
      _abnController.text = widget.barber.abn ?? '';
      _instagramController.text = widget.barber.instagramHandle ?? '';
      _tiktokController.text = widget.barber.tiktokHandle ?? '';
      _radiusValue = widget.barber.serviceRadiusKm.toDouble();
    }
  }

  @override
  void dispose() {
    _abnController.dispose();
    _instagramController.dispose();
    _tiktokController.dispose();
    super.dispose();
  }

  Future<void> _uploadCert() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    );
    if (result == null || result.files.isEmpty || !mounted) return;

    final file = result.files.single;
    final fileName = file.name;
    final mimeType = fileName.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : fileName.toLowerCase().endsWith('.png')
            ? 'image/png'
            : 'image/jpeg';

    List<int> bytes;
    if (file.bytes != null) {
      bytes = file.bytes!;
    } else if (file.path != null) {
      bytes = await File(file.path!).readAsBytes();
    } else {
      return;
    }

    try {
      final barberRepo = ref.read(barberProfileRepositoryProvider);
      final dio = ref.read(dioProvider);
      final uploadResult = await barberRepo.fetchCertUploadUrl(fileName, mimeType);

      await dio.put<dynamic>(
        uploadResult.uploadUrl,
        data: bytes,
        options: Options(
          contentType: mimeType,
          headers: {'Content-Type': mimeType},
        ),
      );

      await barberRepo.updateBarber(certDocumentUrl: uploadResult.cdnUrl);
      widget.onSaved();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Cert uploaded')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e')),
        );
      }
    }
  }

  Future<void> _save() async {
    try {
      await ref.read(barberProfileRepositoryProvider).updateBarber(
            abn: _abnController.text.trim().isEmpty ? null : _abnController.text.trim(),
            instagramHandle: _instagramController.text.trim().isEmpty ? null : _instagramController.text.trim(),
            tiktokHandle: _tiktokController.text.trim().isEmpty ? null : _tiktokController.text.trim(),
            serviceRadiusKm: _radiusValue.round(),
          );
      widget.onSaved();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Save failed: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Barber Details', style: AppTextStyles.h3),
        const SizedBox(height: 12),
        TextField(
          controller: _abnController,
          decoration: const InputDecoration(
            labelText: 'ABN (11 digits)',
            border: OutlineInputBorder(),
          ),
          keyboardType: TextInputType.number,
          maxLength: 11,
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          key: ValueKey(widget.barber.aqfCertLevel ?? 'cert_iii'),
          initialValue: widget.barber.aqfCertLevel ?? 'cert_iii',
          decoration: const InputDecoration(
            labelText: 'AQF Cert',
            border: OutlineInputBorder(),
          ),
          items: const [
            DropdownMenuItem(value: 'cert_iii', child: Text('Cert III')),
            DropdownMenuItem(value: 'cert_iv', child: Text('Cert IV')),
            DropdownMenuItem(value: 'diploma', child: Text('Diploma')),
          ],
          onChanged: (v) async {
            if (v != null) {
              await ref.read(barberProfileRepositoryProvider).updateBarber(aqfCertLevel: v);
              widget.onSaved();
            }
          },
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: _uploadCert,
          icon: const Icon(Icons.upload_file),
          label: Text(widget.barber.certDocumentUrl != null ? 'Replace Cert' : 'Upload Cert'),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _instagramController,
          decoration: const InputDecoration(
            labelText: 'Instagram',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _tiktokController,
          decoration: const InputDecoration(
            labelText: 'TikTok',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        Text('Service radius: ${_radiusValue.round()} km', style: AppTextStyles.body),
        Slider(
          value: _radiusValue,
          min: 1,
          max: 50,
          divisions: 49,
          activeColor: AppColors.gold,
          onChanged: (v) => setState(() => _radiusValue = v),
        ),
        const SizedBox(height: 8),
        AppButton(
          label: 'Save Barber Details',
          onPressed: _save,
        ),
        const SizedBox(height: 16),
        AppButton(
          label: 'Set Up Payouts',
          onPressed: () async {
            final role = ref.read(authNotifierProvider).role ?? 'consumer';
            if (role != 'barber') return;
            const returnUrl = '${AppConstants.appBaseUrl}/stripe-return';
            const refreshUrl = '${AppConstants.appBaseUrl}/stripe-refresh';
            final url = await ref.read(barberProfileRepositoryProvider).fetchStripeOnboardingUrl(
                  returnUrl: returnUrl,
                  refreshUrl: refreshUrl,
                );
            if (!context.mounted) return;
            await Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (ctx) => StripeOnboardingWebView(
                  url: url,
                  returnUrl: returnUrl,
                  onComplete: () {
                    Navigator.of(ctx).pop();
                    widget.onSaved();
                  },
                ),
              ),
            );
            widget.onSaved();
          },
          icon: Icons.payments,
        ),
      ],
    );
  }
}

class _StudioProfileForm extends ConsumerStatefulWidget {
  const _StudioProfileForm({
    required this.studio,
    required this.onSaved,
  });

  final ProfileStudioData studio;
  final VoidCallback onSaved;

  @override
  ConsumerState<_StudioProfileForm> createState() => _StudioProfileFormState();
}

class _StudioProfileFormState extends ConsumerState<_StudioProfileForm> {
  late TextEditingController _businessNameController;
  late TextEditingController _abnController;
  late TextEditingController _addressController;
  late TextEditingController _suburbController;
  late TextEditingController _stateController;
  late TextEditingController _postcodeController;

  @override
  void initState() {
    super.initState();
    _businessNameController = TextEditingController(text: widget.studio.businessName);
    _abnController = TextEditingController(text: widget.studio.abn ?? '');
    _addressController = TextEditingController(text: widget.studio.addressLine1 ?? '');
    _suburbController = TextEditingController(text: widget.studio.suburb ?? '');
    _stateController = TextEditingController(text: widget.studio.state ?? '');
    _postcodeController = TextEditingController(text: widget.studio.postcode ?? '');
  }

  @override
  void didUpdateWidget(covariant _StudioProfileForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.studio.id != widget.studio.id) {
      _businessNameController.text = widget.studio.businessName;
      _abnController.text = widget.studio.abn ?? '';
      _addressController.text = widget.studio.addressLine1 ?? '';
      _suburbController.text = widget.studio.suburb ?? '';
      _stateController.text = widget.studio.state ?? '';
      _postcodeController.text = widget.studio.postcode ?? '';
    }
  }

  @override
  void dispose() {
    _businessNameController.dispose();
    _abnController.dispose();
    _addressController.dispose();
    _suburbController.dispose();
    _stateController.dispose();
    _postcodeController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    try {
      await ref.read(studioRepositoryProvider).updateStudio(
            businessName: _businessNameController.text.trim(),
            abn: _abnController.text.trim().isEmpty ? null : _abnController.text.trim(),
            addressLine1: _addressController.text.trim().isEmpty ? null : _addressController.text.trim(),
            suburb: _suburbController.text.trim().isEmpty ? null : _suburbController.text.trim(),
            state: _stateController.text.trim().isEmpty ? null : _stateController.text.trim(),
            postcode: _postcodeController.text.trim().isEmpty ? null : _postcodeController.text.trim(),
          );
      widget.onSaved();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Save failed: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Studio Details', style: AppTextStyles.h3),
        if (widget.studio.isVerified)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                const Icon(Icons.verified, color: AppColors.success, size: 20),
                const SizedBox(width: 8),
                Text('Verified', style: AppTextStyles.body.copyWith(color: AppColors.success)),
              ],
            ),
          ),
        const SizedBox(height: 8),
        TextField(
          controller: _businessNameController,
          decoration: const InputDecoration(
            labelText: 'Business Name',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _abnController,
          decoration: const InputDecoration(
            labelText: 'ABN (11 digits)',
            border: OutlineInputBorder(),
          ),
          keyboardType: TextInputType.number,
          maxLength: 11,
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _addressController,
          decoration: const InputDecoration(
            labelText: 'Address',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _suburbController,
          decoration: const InputDecoration(
            labelText: 'Suburb',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _stateController,
          decoration: const InputDecoration(
            labelText: 'State',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _postcodeController,
          decoration: const InputDecoration(
            labelText: 'Postcode',
            border: OutlineInputBorder(),
          ),
          keyboardType: TextInputType.number,
        ),
        const SizedBox(height: 16),
        AppButton(
          label: 'Save Studio Details',
          onPressed: _save,
        ),
        const SizedBox(height: 16),
        AppButton(
          label: 'Set Up Payouts',
          onPressed: () async {
            final role = ref.read(authNotifierProvider).role ?? 'consumer';
            if (role != 'studio') return;
            const returnUrl = '${AppConstants.appBaseUrl}/stripe-return';
            const refreshUrl = '${AppConstants.appBaseUrl}/stripe-refresh';
            final url = await ref.read(studioRepositoryProvider).fetchStripeOnboardingUrl(
                  returnUrl: returnUrl,
                  refreshUrl: refreshUrl,
                );
            if (!context.mounted) return;
            await Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (ctx) => StripeOnboardingWebView(
                  url: url,
                  returnUrl: returnUrl,
                  onComplete: () {
                    Navigator.of(ctx).pop();
                    widget.onSaved();
                  },
                ),
              ),
            );
            widget.onSaved();
          },
          icon: Icons.payments,
        ),
      ],
    );
  }
}
