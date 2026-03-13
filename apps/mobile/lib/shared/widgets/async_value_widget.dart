import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:tapr/shared/widgets/error_view.dart';
import 'package:tapr/shared/widgets/loading_indicator.dart';

class AsyncValueWidget<T> extends StatelessWidget {
  const AsyncValueWidget({
    super.key,
    required this.value,
    required this.data,
    this.loading,
    this.error,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final Widget Function()? loading;
  final Widget Function(Object error, StackTrace? stackTrace)? error;

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: data,
      loading: () => loading?.call() ?? const LoadingOverlay(),
      error: (e, st) =>
          error?.call(e, st) ??
          ErrorView(
            message: e.toString(),
            onRetry: () {},
          ),
    );
  }
}
