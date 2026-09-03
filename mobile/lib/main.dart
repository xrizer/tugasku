import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

const lifeHackWebUrl = 'https://lifehack-secret.vercel.app/';

void main() {
  runApp(const LifeHackApp());
}

class LifeHackApp extends StatelessWidget {
  const LifeHackApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'LifeHack',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF1A1713),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF48C88A),
          brightness: Brightness.dark,
        ),
      ),
      home: const LifeHackWebPage(),
    );
  }
}

class LifeHackWebPage extends StatefulWidget {
  const LifeHackWebPage({super.key});

  @override
  State<LifeHackWebPage> createState() => _LifeHackWebPageState();
}

class _LifeHackWebPageState extends State<LifeHackWebPage> {
  late final WebViewController _controller;
  int _progress = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF1A1713))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) => setState(() {
            _error = null;
            _progress = 0;
          }),
          onProgress: (progress) => setState(() => _progress = progress),
          onWebResourceError: (error) {
            if (error.isForMainFrame == true) {
              setState(() => _error = error.description);
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(lifeHackWebUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_progress < 100 && _error == null)
            Align(
              alignment: Alignment.topCenter,
              child: LinearProgressIndicator(value: _progress / 100),
            ),
          if (_error != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.cloud_off_outlined, size: 38),
                        const SizedBox(height: 12),
                        const Text('LifeHack tidak bisa dimuat.'),
                        const SizedBox(height: 8),
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          onPressed: () => _controller.reload(),
                          icon: const Icon(Icons.refresh),
                          label: const Text('Coba lagi'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
